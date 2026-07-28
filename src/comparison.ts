import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type {
  AuditReport,
  CheckId,
  ComparisonChange,
  Evidence,
  Finding,
  FindingComparisonEvidence,
  ReportComparison,
  Severity,
} from "./types.js";

type BaselineFinding = Pick<Finding, "id" | "title" | "severity"> &
  Partial<
    Pick<
      Finding,
      "summary" | "deduction" | "evidence" | "comparisonEvidence"
    >
  >;

export interface BaselineReport {
  generatedAt: string;
  findings: BaselineFinding[];
}

const ACTIONABLE = new Set<Severity>(["critical", "warning", "unknown"]);
const AGGREGATE_CHECKS = new Set<CheckId>([
  "action-pinning",
  "outdated-dependencies",
  "todo-fixme",
  "large-files",
  "tracked-env",
  "scan-coverage",
]);
const RANK: Record<Exclude<Severity, "unknown">, number> = {
  pass: 0,
  info: 0,
  warning: 1,
  critical: 2,
};

function isSeverity(value: unknown): value is Severity {
  return (
    value === "pass" ||
    value === "info" ||
    value === "warning" ||
    value === "critical" ||
    value === "unknown"
  );
}

function isEvidenceValue(
  value: unknown,
): value is Evidence["value"] {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function parseOptionalEvidence(
  value: unknown,
  findingIndex: number,
): Evidence[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new Error(
      `Baseline finding ${findingIndex + 1} has invalid evidence.`,
    );
  }
  return value.map((item, evidenceIndex) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error(
        `Baseline finding ${findingIndex + 1} evidence ${evidenceIndex + 1} is invalid.`,
      );
    }
    const evidenceItem = item as Record<string, unknown>;
    if (
      typeof evidenceItem.label !== "string" ||
      !isEvidenceValue(evidenceItem.value)
    ) {
      throw new Error(
        `Baseline finding ${findingIndex + 1} evidence ${evidenceIndex + 1} is incomplete.`,
      );
    }
    return {
      label: evidenceItem.label,
      value: evidenceItem.value,
    };
  });
}

function parseOptionalComparisonEvidence(
  value: unknown,
  findingIndex: number,
): FindingComparisonEvidence | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      `Baseline finding ${findingIndex + 1} has invalid comparison evidence.`,
    );
  }
  const candidate = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(candidate.count) ||
    (candidate.count as number) < 0 ||
    !(
      candidate.digest === null ||
      (typeof candidate.digest === "string" &&
        /^[a-f0-9]{64}$/.test(candidate.digest))
    )
  ) {
    throw new Error(
      `Baseline finding ${findingIndex + 1} has incomplete comparison evidence.`,
    );
  }
  return {
    count: candidate.count as number,
    digest: candidate.digest as string | null,
  };
}

function parseBaseline(value: unknown, source: string): BaselineReport {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Baseline ${source} must be a RepoLens JSON object.`);
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== 1 && candidate.schemaVersion !== 2) {
    throw new Error(`Baseline ${source} has an unsupported schemaVersion.`);
  }
  if (typeof candidate.generatedAt !== "string") {
    throw new Error(`Baseline ${source} is missing generatedAt.`);
  }
  if (!Array.isArray(candidate.findings)) {
    throw new Error(`Baseline ${source} is missing findings.`);
  }

  const findings = candidate.findings.map((item, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error(`Baseline finding ${index + 1} is invalid.`);
    }
    const finding = item as Record<string, unknown>;
    if (
      typeof finding.id !== "string" ||
      typeof finding.title !== "string" ||
      !isSeverity(finding.severity)
    ) {
      throw new Error(`Baseline finding ${index + 1} is incomplete.`);
    }
    const parsed: BaselineFinding = {
      id: finding.id as CheckId,
      title: finding.title,
      severity: finding.severity,
    };
    if (finding.summary !== undefined) {
      if (typeof finding.summary !== "string") {
        throw new Error(
          `Baseline finding ${index + 1} has an invalid summary.`,
        );
      }
      parsed.summary = finding.summary;
    }
    if (finding.deduction !== undefined) {
      if (
        typeof finding.deduction !== "number" ||
        !Number.isFinite(finding.deduction)
      ) {
        throw new Error(
          `Baseline finding ${index + 1} has an invalid deduction.`,
        );
      }
      parsed.deduction = finding.deduction;
    }
    const parsedEvidence = parseOptionalEvidence(finding.evidence, index);
    if (parsedEvidence !== undefined) parsed.evidence = parsedEvidence;
    const parsedComparisonEvidence = parseOptionalComparisonEvidence(
      finding.comparisonEvidence,
      index,
    );
    if (parsedComparisonEvidence !== undefined) {
      parsed.comparisonEvidence = parsedComparisonEvidence;
    }
    return parsed;
  });

  return {
    generatedAt: candidate.generatedAt,
    findings,
  };
}

export async function loadBaseline(
  path: string,
): Promise<{ source: string; report: BaselineReport }> {
  const source = resolve(path);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(source, "utf8")) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read baseline ${source}: ${detail}`);
  }
  return { source, report: parseBaseline(parsed, source) };
}

function classifyChange(
  previous: Severity | null,
  current: Severity | null,
): ComparisonChange["kind"] | null {
  if (previous === current) return null;
  if (previous === null) return "new";
  if (current === null) return "resolved";
  if (current === "unknown") return "worsened";
  if (previous === "unknown") {
    return current === "critical" || current === "warning"
      ? "worsened"
      : "resolved";
  }
  if (RANK[current] > RANK[previous]) return "worsened";
  if (RANK[current] < RANK[previous]) {
    return RANK[current] === 0 ? "resolved" : "improved";
  }
  return null;
}

function normalized(value: Evidence["value"]): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function evidenceIdentity(
  check: CheckId,
  item: Evidence,
): string | null {
  const label = normalized(item.label);
  const value = normalized(item.value);

  switch (check) {
    case "action-pinning": {
      const separator = value.lastIndexOf("@");
      const action =
        separator > 0 ? value.slice(0, separator) : value;
      return `${label}\u0000${action.toLowerCase()}`;
    }
    case "outdated-dependencies":
      return label;
    case "todo-fixme":
      return `${label.replace(/:\d+$/, "")}\u0000${value}`;
    case "large-files":
      return label;
    case "tracked-env":
      return value;
    case "scan-coverage":
      return label === "unknown" ? value : null;
    default:
      return null;
  }
}

function identityCounts(
  finding: BaselineFinding,
): Map<string, number> | null {
  if (!finding.evidence) return null;
  const counts = new Map<string, number>();
  for (const item of finding.evidence) {
    const identity = evidenceIdentity(finding.id, item);
    if (identity === null) continue;
    counts.set(identity, (counts.get(identity) ?? 0) + 1);
  }
  return counts;
}

function addedIdentityCount(
  current: Map<string, number>,
  previous: Map<string, number>,
): number {
  let added = 0;
  for (const [identity, count] of current) {
    added += Math.max(0, count - (previous.get(identity) ?? 0));
  }
  return added;
}

function aggregateCount(finding: BaselineFinding): number | null {
  const summaryCount =
    typeof finding.summary === "string"
      ? /^(\d+)\b/.exec(finding.summary)
      : null;
  if (summaryCount?.[1]) return Number.parseInt(summaryCount[1], 10);
  const identities = identityCounts(finding);
  if (!identities) return null;
  return [...identities.values()].reduce((sum, count) => sum + count, 0);
}

function aggregateChange(
  before: BaselineFinding,
  after: Finding,
): Pick<ComparisonChange, "kind" | "detail"> | null {
  if (
    before.severity !== after.severity ||
    !ACTIONABLE.has(after.severity) ||
    !AGGREGATE_CHECKS.has(after.id)
  ) {
    return null;
  }

  const previousBasis = before.comparisonEvidence;
  const currentBasis = after.comparisonEvidence;
  const previousCount = previousBasis?.count ?? aggregateCount(before);
  const currentCount = currentBasis?.count ?? aggregateCount(after);
  if (
    previousCount !== null &&
    currentCount !== null &&
    previousCount !== currentCount
  ) {
    return currentCount > previousCount
      ? {
          kind: "worsened",
          detail: `Total evidence increased from ${previousCount} to ${currentCount}.`,
        }
      : {
          kind: "improved",
          detail: `Total evidence decreased from ${previousCount} to ${currentCount}.`,
        };
  }

  if (previousBasis && currentBasis) {
    if (
      previousBasis.digest !== null &&
      currentBasis.digest !== null &&
      previousBasis.digest !== currentBasis.digest
    ) {
      return {
        kind: "worsened",
        detail: `Evidence changed while the total remained ${currentBasis.count}.`,
      };
    }
    return null;
  }

  // Older baselines only contain the display evidence, which may be truncated
  // or re-ordered. Equal full counts are therefore the last safe comparison.
  if (previousCount !== null && currentCount !== null) return null;

  const previousIdentities = identityCounts(before);
  const currentIdentities = identityCounts(after);
  if (!previousIdentities || !currentIdentities) return null;

  const added = addedIdentityCount(
    currentIdentities,
    previousIdentities,
  );
  const removed = addedIdentityCount(
    previousIdentities,
    currentIdentities,
  );
  if (added > 0) {
    return {
      kind: "worsened",
      detail:
        removed > 0
          ? `${added} new evidence item(s); ${removed} accepted item(s) no longer present.`
          : `${added} new evidence item(s).`,
    };
  }
  if (removed > 0) {
    return {
      kind: "improved",
      detail: `${removed} accepted evidence item(s) no longer present.`,
    };
  }
  return null;
}

function emptySeverityCounts(): {
  critical: number;
  warning: number;
  unknown: number;
} {
  return { critical: 0, warning: 0, unknown: 0 };
}

export function compareWithBaseline(
  report: AuditReport,
  baseline: BaselineReport,
  source: string,
): AuditReport {
  const previous = new Map(baseline.findings.map((item) => [item.id, item]));
  const current = new Map(report.findings.map((item) => [item.id, item]));
  const ids = new Set([...previous.keys(), ...current.keys()]);
  const changes: ComparisonChange[] = [];
  const newCounts = emptySeverityCounts();
  const resolvedCounts = emptySeverityCounts();

  for (const id of [...ids].sort()) {
    const before = previous.get(id);
    const after = current.get(id);
    let kind = classifyChange(
      before?.severity ?? null,
      after?.severity ?? null,
    );
    let detail: string | undefined;
    if (!kind && before && after) {
      const aggregate = aggregateChange(before, after);
      kind = aggregate?.kind ?? null;
      detail = aggregate?.detail;
    }
    if (!kind) continue;
    const change: ComparisonChange = {
      check: id,
      title: after?.title ?? before?.title ?? id,
      from: before?.severity ?? null,
      to: after?.severity ?? null,
      kind,
    };
    if (detail) change.detail = detail;
    changes.push(change);

    if (
      (kind === "new" || kind === "worsened") &&
      after &&
      ACTIONABLE.has(after.severity)
    ) {
      if (
        after.severity === "critical" ||
        after.severity === "warning" ||
        after.severity === "unknown"
      ) {
        newCounts[after.severity] += 1;
      }
    }
    if (
      (kind === "resolved" || kind === "improved") &&
      before &&
      ACTIONABLE.has(before.severity)
    ) {
      if (
        before.severity === "critical" ||
        before.severity === "warning" ||
        before.severity === "unknown"
      ) {
        resolvedCounts[before.severity] += 1;
      }
    }
  }

  const comparison: ReportComparison = {
    baseline: {
      source,
      generatedAt: baseline.generatedAt,
    },
    new: newCounts,
    resolved: resolvedCounts,
    changes,
  };
  return { ...report, comparison };
}
