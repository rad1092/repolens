import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { RepoLensError } from "./errors.js";
import { runCommand } from "./process.js";
import { parseRfc3339Timestamp } from "./timestamp.js";
import type {
  AuditReport,
  ComparisonChange,
  Finding,
  FindingCounts,
  Severity,
} from "./types.js";

export interface BaselineAcceptance {
  reason: string;
  owner: string;
  acceptedAt: string;
  expiresAt: string;
  baseCommit: string;
}

export interface AcceptedFinding {
  ruleId: string;
  fingerprint: string;
  severity: "warning" | "critical" | "unknown";
  summary: string;
  path: string | null;
  line: number | null;
}

export interface RepoLensBaselineV3 {
  schemaVersion: 3;
  kind: "repolens-baseline";
  tool: {
    name: "RepoLens";
    version: string;
  };
  repository: {
    name: string;
    githubUrl: string | null;
  };
  acceptance: BaselineAcceptance;
  accepted: AcceptedFinding[];
  migratedFrom?: {
    schemaVersion: 2;
    sha256: string;
    source: string;
  };
}

interface BaselineBuildOptions {
  reason: string;
  owner: string;
  acceptedAt: string;
  expiresAt: string;
  baseCommit: string;
  migratedFrom?: RepoLensBaselineV3["migratedFrom"];
}

const ACTIONABLE = new Set<Severity>([
  "warning",
  "critical",
  "unknown",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertKnownKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  context: string,
): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new RepoLensError(
      "BASELINE_INVALID",
      `${context} contains unknown field${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.`,
    );
  }
}

function parseTimestamp(
  value: unknown,
  field: string,
): { value: string; timestamp: number } {
  const parsed = parseRfc3339Timestamp(value);
  if (!parsed) {
    throw new RepoLensError(
      "BASELINE_INVALID",
      `${field} must be a valid RFC 3339 date-time.`,
    );
  }
  return parsed;
}

function parseAcceptance(value: unknown): BaselineAcceptance {
  if (!isObject(value)) {
    throw new RepoLensError(
      "BASELINE_INVALID",
      "baseline acceptance metadata is missing.",
    );
  }
  assertKnownKeys(
    value,
    new Set([
      "reason",
      "owner",
      "acceptedAt",
      "expiresAt",
      "baseCommit",
    ]),
    "baseline acceptance",
  );
  const reason = typeof value.reason === "string" ? value.reason.trim() : "";
  const owner = typeof value.owner === "string" ? value.owner.trim() : "";
  if (reason.length < 8) {
    throw new RepoLensError(
      "BASELINE_INVALID",
      "acceptance.reason must explain the reviewed debt in at least 8 characters.",
    );
  }
  if (owner.length < 2) {
    throw new RepoLensError(
      "BASELINE_INVALID",
      "acceptance.owner must identify the reviewer.",
    );
  }
  const acceptedAt = parseTimestamp(
    value.acceptedAt,
    "acceptance.acceptedAt",
  );
  const expiresAt = parseTimestamp(
    value.expiresAt,
    "acceptance.expiresAt",
  );
  if (expiresAt.timestamp <= acceptedAt.timestamp) {
    throw new RepoLensError(
      "BASELINE_INVALID",
      "acceptance.expiresAt must be later than acceptance.acceptedAt.",
    );
  }
  if (
    typeof value.baseCommit !== "string" ||
    !/^[a-f0-9]{40}$/i.test(value.baseCommit)
  ) {
    throw new RepoLensError(
      "BASELINE_INVALID",
      "acceptance.baseCommit must be a full 40-character Git commit SHA.",
    );
  }
  return {
    reason,
    owner,
    acceptedAt: acceptedAt.value,
    expiresAt: expiresAt.value,
    baseCommit: value.baseCommit.toLowerCase(),
  };
}

function parseAccepted(value: unknown): AcceptedFinding[] {
  if (!Array.isArray(value)) {
    throw new RepoLensError(
      "BASELINE_INVALID",
      "baseline accepted must be an array.",
    );
  }
  const seen = new Set<string>();
  return value.map((item, index) => {
    if (!isObject(item)) {
      throw new RepoLensError(
        "BASELINE_INVALID",
        `accepted finding ${index + 1} must be an object.`,
      );
    }
    assertKnownKeys(
      item,
      new Set([
        "ruleId",
        "fingerprint",
        "severity",
        "summary",
        "path",
        "line",
      ]),
      `accepted finding ${index + 1}`,
    );
    if (
      typeof item.ruleId !== "string" ||
      !item.ruleId.includes("/") ||
      typeof item.fingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(item.fingerprint) ||
      !(
        item.severity === "warning" ||
        item.severity === "critical" ||
        item.severity === "unknown"
      ) ||
      typeof item.summary !== "string"
    ) {
      throw new RepoLensError(
        "BASELINE_INVALID",
        `accepted finding ${index + 1} is incomplete.`,
      );
    }
    if (
      item.path !== null &&
      typeof item.path !== "string"
    ) {
      throw new RepoLensError(
        "BASELINE_INVALID",
        `accepted finding ${index + 1}.path must be a string or null.`,
      );
    }
    if (
      item.line !== null &&
      (!Number.isSafeInteger(item.line) || (item.line as number) <= 0)
    ) {
      throw new RepoLensError(
        "BASELINE_INVALID",
        `accepted finding ${index + 1}.line must be a positive integer or null.`,
      );
    }
    if (seen.has(item.fingerprint)) {
      throw new RepoLensError(
        "BASELINE_INVALID",
        `accepted finding ${index + 1} duplicates fingerprint ${item.fingerprint}.`,
      );
    }
    seen.add(item.fingerprint);
    return {
      ruleId: item.ruleId,
      fingerprint: item.fingerprint,
      severity: item.severity,
      summary: item.summary,
      path: item.path,
      line: item.line as number | null,
    };
  });
}

export function parseBaselineV3(
  value: unknown,
  now = new Date(),
): RepoLensBaselineV3 {
  if (!isObject(value)) {
    throw new RepoLensError(
      "BASELINE_INVALID",
      "baseline must be a JSON object.",
    );
  }
  if (value.schemaVersion === 2) {
    throw new RepoLensError(
      "BASELINE_MIGRATION_REQUIRED",
      "Report baseline v2 cannot be used as an implicit gate. Review the current scan and run `repolens baseline accept --from-v2 <report.json> --reason ... --owner ... --expires ...`.",
    );
  }
  assertKnownKeys(
    value,
    new Set([
      "schemaVersion",
      "kind",
      "tool",
      "repository",
      "acceptance",
      "accepted",
      "migratedFrom",
    ]),
    "baseline",
  );
  if (value.schemaVersion !== 3 || value.kind !== "repolens-baseline") {
    throw new RepoLensError(
      "BASELINE_INVALID",
      "baseline must use RepoLens compact baseline schemaVersion 3.",
    );
  }
  if (
    !isObject(value.tool) ||
    value.tool.name !== "RepoLens" ||
    typeof value.tool.version !== "string" ||
    value.tool.version.trim().length === 0
  ) {
    throw new RepoLensError(
      "BASELINE_INVALID",
      "baseline tool metadata is invalid.",
    );
  }
  assertKnownKeys(
    value.tool,
    new Set(["name", "version"]),
    "baseline tool",
  );
  if (
    !isObject(value.repository) ||
    typeof value.repository.name !== "string" ||
    !(
      value.repository.githubUrl === null ||
      typeof value.repository.githubUrl === "string"
    )
  ) {
    throw new RepoLensError(
      "BASELINE_INVALID",
      "baseline repository metadata is invalid.",
    );
  }
  assertKnownKeys(
    value.repository,
    new Set(["name", "githubUrl"]),
    "baseline repository",
  );
  const acceptance = parseAcceptance(value.acceptance);
  if (Date.parse(acceptance.expiresAt) <= now.getTime()) {
    throw new RepoLensError(
      "BASELINE_EXPIRED",
      `The reviewed baseline expired at ${acceptance.expiresAt}. Fix the debt or accept it again with a new reason and expiration.`,
    );
  }
  const baseline: RepoLensBaselineV3 = {
    schemaVersion: 3,
    kind: "repolens-baseline",
    tool: {
      name: "RepoLens",
      version: value.tool.version,
    },
    repository: {
      name: value.repository.name,
      githubUrl: value.repository.githubUrl,
    },
    acceptance,
    accepted: parseAccepted(value.accepted),
  };
  if (value.migratedFrom !== undefined) {
    if (
      !isObject(value.migratedFrom) ||
      value.migratedFrom.schemaVersion !== 2 ||
      typeof value.migratedFrom.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.migratedFrom.sha256) ||
      typeof value.migratedFrom.source !== "string" ||
      value.migratedFrom.source.trim().length === 0
    ) {
      throw new RepoLensError(
        "BASELINE_INVALID",
        "baseline migratedFrom metadata is invalid.",
      );
    }
    assertKnownKeys(
      value.migratedFrom,
      new Set(["schemaVersion", "sha256", "source"]),
      "baseline migratedFrom",
    );
    baseline.migratedFrom = {
      schemaVersion: 2,
      sha256: value.migratedFrom.sha256,
      source: value.migratedFrom.source,
    };
  }
  return baseline;
}

export async function loadAcceptedBaseline(
  path: string,
  now = new Date(),
): Promise<{ source: string; baseline: RepoLensBaselineV3 }> {
  const source = resolve(path);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(source, "utf8")) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new RepoLensError(
      "BASELINE_INVALID",
      `Could not read baseline ${source}: ${detail}`,
    );
  }
  return { source, baseline: parseBaselineV3(parsed, now) };
}

export async function currentCommit(root: string): Promise<string> {
  const result = await runCommand("git", ["rev-parse", "HEAD"], {
    cwd: root,
    allowFailure: true,
  });
  const commit = result?.stdout.trim() ?? "";
  if (!/^[a-f0-9]{40}$/i.test(commit)) {
    throw new RepoLensError(
      "BASELINE_INVALID",
      "A baseline requires a Git repository with a committed HEAD.",
    );
  }
  return commit.toLowerCase();
}

export async function validateBaselineCommit(
  root: string,
  baseline: RepoLensBaselineV3,
): Promise<void> {
  const available = await runCommand(
    "git",
    ["cat-file", "-e", `${baseline.acceptance.baseCommit}^{commit}`],
    { cwd: root, allowFailure: true },
  );
  if (!available) {
    throw new RepoLensError(
      "BASELINE_INVALID",
      `Baseline baseCommit ${baseline.acceptance.baseCommit} is not available in this checkout.`,
    );
  }
  const ancestor = await runCommand(
    "git",
    [
      "merge-base",
      "--is-ancestor",
      baseline.acceptance.baseCommit,
      "HEAD",
    ],
    { cwd: root, allowFailure: true },
  );
  if (!ancestor) {
    throw new RepoLensError(
      "BASELINE_INVALID",
      `Baseline baseCommit ${baseline.acceptance.baseCommit} is not an ancestor of the inspected checkout.`,
    );
  }
}

export function buildAcceptedBaseline(
  report: AuditReport,
  options: BaselineBuildOptions,
): RepoLensBaselineV3 {
  const acceptance = parseAcceptance({
    reason: options.reason,
    owner: options.owner,
    acceptedAt: options.acceptedAt,
    expiresAt: options.expiresAt,
    baseCommit: options.baseCommit,
  });
  const accepted = report.findings
    .filter(
      (finding) =>
        ACTIONABLE.has(finding.severity) &&
        typeof finding.ruleId === "string" &&
        typeof finding.fingerprint === "string" &&
        !finding.ignored,
    )
    .map((finding): AcceptedFinding => ({
      ruleId: finding.ruleId ?? finding.id,
      fingerprint: finding.fingerprint ?? "",
      severity: finding.severity as AcceptedFinding["severity"],
      summary: finding.summary,
      path: finding.location?.path ?? null,
      line: finding.location?.line ?? null,
    }))
    .sort(
      (a, b) =>
        a.ruleId.localeCompare(b.ruleId) ||
        a.fingerprint.localeCompare(b.fingerprint),
    );
  const baseline: RepoLensBaselineV3 = {
    schemaVersion: 3,
    kind: "repolens-baseline",
    tool: {
      name: "RepoLens",
      version: report.tool.version,
    },
    repository: {
      name: report.repository.name,
      githubUrl: report.repository.github?.url ?? null,
    },
    acceptance,
    accepted,
  };
  if (options.migratedFrom) {
    baseline.migratedFrom = options.migratedFrom;
  }
  return baseline;
}

export async function writeAcceptedBaseline(
  path: string,
  baseline: RepoLensBaselineV3,
  force: boolean,
): Promise<void> {
  await writeFile(resolve(path), `${JSON.stringify(baseline, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o644,
    flag: force ? "w" : "wx",
  });
}

export async function migrationProvenance(
  source: string,
): Promise<RepoLensBaselineV3["migratedFrom"]> {
  const absolute = resolve(source);
  const raw = await readFile(absolute, "utf8").catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    throw new RepoLensError(
      "BASELINE_INVALID",
      `Could not read v2 report ${absolute}: ${detail}`,
    );
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new RepoLensError(
      "BASELINE_INVALID",
      `${absolute} is not valid JSON.`,
    );
  }
  if (!isObject(parsed) || parsed.schemaVersion !== 2) {
    throw new RepoLensError(
      "BASELINE_INVALID",
      `${absolute} is not a RepoLens report schemaVersion 2.`,
    );
  }
  return {
    schemaVersion: 2,
    sha256: createHash("sha256").update(raw).digest("hex"),
    source: absolute,
  };
}

function emptyCounts(): Pick<
  FindingCounts,
  "critical" | "warning" | "unknown"
> {
  return { critical: 0, warning: 0, unknown: 0 };
}

function rank(severity: AcceptedFinding["severity"]): number {
  if (severity === "critical") return 3;
  if (severity === "warning") return 2;
  return 1;
}

function asAcceptedSeverity(
  severity: Severity,
): AcceptedFinding["severity"] | null {
  return severity === "critical" ||
    severity === "warning" ||
    severity === "unknown"
    ? severity
    : null;
}

export function compareWithAcceptedBaseline(
  report: AuditReport,
  baseline: RepoLensBaselineV3,
  source: string,
): AuditReport {
  const previous = new Map(
    baseline.accepted.map((finding) => [
      finding.fingerprint,
      finding,
    ]),
  );
  const current = new Map(
    report.findings
      .filter(
        (finding) =>
          finding.ignored === null &&
          typeof finding.fingerprint === "string" &&
          asAcceptedSeverity(finding.severity) !== null,
      )
      .map((finding) => [finding.fingerprint ?? "", finding]),
  );
  const newCounts = emptyCounts();
  const resolvedCounts = emptyCounts();
  const acceptedCounts = emptyCounts();
  const changes: ComparisonChange[] = [];

  for (const finding of current.values()) {
    const severity = asAcceptedSeverity(finding.severity);
    if (!severity) continue;
    const accepted = previous.get(finding.fingerprint ?? "");
    const regressed =
      !accepted || rank(severity) > rank(accepted.severity);
    if (regressed) {
      newCounts[severity] += 1;
      changes.push({
        check: finding.id,
        ruleId: finding.ruleId ?? finding.id,
        fingerprint: finding.fingerprint ?? "",
        path: finding.location?.path ?? null,
        line: finding.location?.line ?? null,
        title: finding.title,
        from: accepted?.severity ?? null,
        to: finding.severity,
        kind: accepted ? "worsened" : "new",
      });
    } else {
      acceptedCounts[severity] += 1;
    }
  }

  for (const accepted of previous.values()) {
    if (current.has(accepted.fingerprint)) continue;
    resolvedCounts[accepted.severity] += 1;
    changes.push({
      check: "baseline-integrity",
      ruleId: accepted.ruleId,
      fingerprint: accepted.fingerprint,
      path: accepted.path,
      line: accepted.line,
      title: accepted.ruleId,
      from: accepted.severity,
      to: null,
      kind: "resolved",
    });
  }

  return {
    ...report,
    comparison: {
      baseline: {
        source,
        generatedAt: baseline.acceptance.acceptedAt,
      },
      new: newCounts,
      resolved: resolvedCounts,
      accepted: acceptedCounts,
      changes,
    },
    summary: {
      newRegressions:
        newCounts.critical + newCounts.warning + newCounts.unknown,
      acceptedDebt:
        acceptedCounts.critical +
        acceptedCounts.warning +
        acceptedCounts.unknown,
      unknownCoverage: report.counts.unknown,
      ignored: report.ignoredFindings?.length ?? 0,
    },
  };
}
