import {
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import {
  buildAcceptedBaseline,
  currentCommit,
  migrationProvenance,
  writeAcceptedBaseline,
} from "./baseline.js";
import {
  DEFAULT_CONFIG,
  renderDefaultConfig,
} from "./config.js";
import { TOOL_VERSION } from "./constants.js";
import { RepoLensError } from "./errors.js";
import { runCommand } from "./process.js";
import { runAudit } from "./runner.js";
import { parseRfc3339Timestamp } from "./timestamp.js";

export const DEFAULT_BASELINE_PATH =
  ".repolens/baselines/accepted.json";
export const DEFAULT_WORKFLOW_PATH =
  ".github/workflows/repolens.yml";

interface AcceptanceInput {
  reason: string | null;
  owner: string | null;
  expiresAt: string | null;
}

interface BaselineAcceptOptions extends AcceptanceInput {
  target: string;
  output: string | null;
  fromV2: string | null;
  force: boolean;
}

interface SetupOptions extends AcceptanceInput {
  target: string;
  force: boolean;
  actionSha: string | null;
  githubToken: string | null;
}

async function isFile(path: string): Promise<boolean> {
  return (await stat(path).catch(() => null))?.isFile() === true;
}

function defaultExpiry(now: Date): string {
  return new Date(
    now.getTime() + 90 * 24 * 60 * 60 * 1000,
  ).toISOString();
}

async function defaultOwner(target: string): Promise<string> {
  const result = await runCommand("git", ["config", "user.name"], {
    cwd: target,
    allowFailure: true,
  });
  const configured = result?.stdout.trim();
  return configured || process.env.USER || "repository maintainer";
}

async function repositoryBranch(target: string): Promise<string> {
  const candidates = [
    ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"],
    ["symbolic-ref", "--quiet", "--short", "HEAD"],
  ];
  for (const args of candidates) {
    const result = await runCommand("git", args, {
      cwd: target,
      allowFailure: true,
    });
    const branch = result?.stdout.trim().replace(/^origin\//, "") ?? "";
    if (branch && !/[\r\n]/.test(branch)) return branch;
  }
  throw new RepoLensError(
    "EXECUTION_FAILED",
    "Setup could not determine the repository default or current branch.",
  );
}

async function acceptance(
  target: string,
  input: AcceptanceInput,
  now: Date,
): Promise<{
  reason: string;
  owner: string;
  acceptedAt: string;
  expiresAt: string;
  baseCommit: string;
}> {
  const reason =
    input.reason?.trim() ||
    "Initial repository maintenance debt reviewed during setup";
  const owner = input.owner?.trim() || (await defaultOwner(target));
  const acceptedAt = now.toISOString();
  const expiresAt = input.expiresAt ?? defaultExpiry(now);
  const expiration = parseRfc3339Timestamp(expiresAt);
  if (reason.length < 8) {
    throw new RepoLensError(
      "BASELINE_INVALID",
      "Acceptance reason must contain at least 8 characters.",
    );
  }
  if (owner.length < 2) {
    throw new RepoLensError(
      "BASELINE_INVALID",
      "Acceptance owner must identify the reviewer.",
    );
  }
  if (!expiration || expiration.timestamp <= now.getTime()) {
    throw new RepoLensError(
      "BASELINE_INVALID",
      "Acceptance expiration must be a valid future RFC 3339 date-time.",
    );
  }
  return {
    reason,
    owner,
    acceptedAt,
    expiresAt: expiration.value,
    baseCommit: await currentCommit(target),
  };
}

async function auditForAcceptance(target: string, now: Date) {
  return runAudit({
    target,
    configPath: null,
    baselinePath: null,
    failOn: "none",
    strict: false,
    offline: true,
    githubToken: null,
    now,
  });
}

export async function acceptCurrentBaseline(
  options: BaselineAcceptOptions,
): Promise<string> {
  const target = resolve(options.target);
  const now = new Date();
  const result = await auditForAcceptance(target, now);
  const destination = resolve(
    target,
    options.output ?? DEFAULT_BASELINE_PATH,
  );
  await mkdir(dirname(destination), { recursive: true });
  const migratedFrom = options.fromV2
    ? await migrationProvenance(options.fromV2)
    : undefined;
  const metadata = await acceptance(target, options, now);
  const baseline = buildAcceptedBaseline(result.report, {
    ...metadata,
    ...(migratedFrom ? { migratedFrom } : {}),
  });
  await writeAcceptedBaseline(destination, baseline, options.force);
  return destination;
}

async function githubJson(
  url: string,
  token: string | null,
): Promise<Record<string, unknown> | null> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": `RepoLens/${TOOL_VERSION}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(8_000),
  }).catch(() => null);
  if (!response?.ok) return null;
  const value = (await response.json()) as unknown;
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function resolveReleaseActionSha(
  requested: string | null,
  token: string | null,
): Promise<string> {
  if (requested) {
    if (!/^[a-f0-9]{40}$/i.test(requested)) {
      throw new RepoLensError(
        "ACTION_SHA_UNAVAILABLE",
        "--action-sha must be a full 40-character commit SHA.",
      );
    }
    return requested.toLowerCase();
  }

  const tag = encodeURIComponent(`v${TOOL_VERSION}`);
  const reference = await githubJson(
    `https://api.github.com/repos/rad1092/repolens/git/ref/tags/${tag}`,
    token,
  );
  const object =
    reference &&
    typeof reference.object === "object" &&
    reference.object !== null &&
    !Array.isArray(reference.object)
      ? (reference.object as Record<string, unknown>)
      : null;
  if (object?.type === "commit" && typeof object.sha === "string") {
    return object.sha;
  }
  if (object?.type === "tag" && typeof object.sha === "string") {
    const tagObject = await githubJson(
      `https://api.github.com/repos/rad1092/repolens/git/tags/${object.sha}`,
      token,
    );
    const target =
      tagObject &&
      typeof tagObject.object === "object" &&
      tagObject.object !== null &&
      !Array.isArray(tagObject.object)
        ? (tagObject.object as Record<string, unknown>)
        : null;
    if (target?.type === "commit" && typeof target.sha === "string") {
      return target.sha;
    }
  }
  throw new RepoLensError(
    "ACTION_SHA_UNAVAILABLE",
    `Could not resolve immutable v${TOOL_VERSION} Action commit. After the release exists, retry setup or pass --action-sha explicitly.`,
  );
}

export function renderSetupWorkflow(
  actionSha: string,
  branch: string,
): string {
  return `name: Repository maintenance regression

on:
  pull_request:
  push:
    branches: [${JSON.stringify(branch)}]
  schedule:
    - cron: "17 0 * * 1"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  repolens:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5
        with:
          fetch-depth: 0
          persist-credentials: false

      - id: repolens
        uses: rad1092/repolens@${actionSha} # v${TOOL_VERSION}
        env:
          GITHUB_TOKEN: \${{ github.token }}
        with:
          target: "."
          config: ".repolens.json"
          baseline: "${DEFAULT_BASELINE_PATH}"

      - if: always() && steps.repolens.outputs.report-json != ''
        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4
        with:
          name: repolens-report
          path: |
            \${{ steps.repolens.outputs.report-json }}
            \${{ steps.repolens.outputs.report-html }}
            \${{ steps.repolens.outputs.report-markdown }}
            \${{ steps.repolens.outputs.report-sarif }}
`;
}

export async function setupRepository(
  options: SetupOptions,
): Promise<{
  config: string;
  baseline: string;
  workflow: string;
  actionSha: string;
}> {
  const target = resolve(options.target);
  const targetStat = await stat(target).catch(() => null);
  if (!targetStat?.isDirectory()) {
    throw new RepoLensError(
      "EXECUTION_FAILED",
      `Setup target is not a directory: ${target}`,
    );
  }
  const config = join(target, ".repolens.json");
  const baseline = join(target, DEFAULT_BASELINE_PATH);
  const workflow = join(target, DEFAULT_WORKFLOW_PATH);
  if (!options.force) {
    const existing = (
      await Promise.all(
        [config, baseline, workflow].map(async (path) => ({
          path,
          exists: await isFile(path),
        })),
      )
    ).filter((item) => item.exists);
    if (existing.length > 0) {
      throw new RepoLensError(
        "EXECUTION_FAILED",
        `Setup would replace existing files: ${existing.map((item) => item.path).join(", ")}. Review them and use --force only when replacement is intended.`,
      );
    }
  }
  const now = new Date();
  const metadata = await acceptance(target, options, now);
  const actionSha = await resolveReleaseActionSha(
    options.actionSha,
    options.githubToken,
  );
  const branch = await repositoryBranch(target);
  await mkdir(dirname(baseline), { recursive: true });
  await mkdir(dirname(workflow), { recursive: true });
  try {
    await writeFile(config, renderDefaultConfig(), {
      encoding: "utf8",
      mode: 0o644,
      flag: options.force ? "w" : "wx",
    });
    await writeFile(workflow, renderSetupWorkflow(actionSha, branch), {
      encoding: "utf8",
      mode: 0o644,
      flag: options.force ? "w" : "wx",
    });
    const result = await auditForAcceptance(target, now);
    await writeAcceptedBaseline(
      baseline,
      buildAcceptedBaseline(result.report, metadata),
      options.force,
    );

    // A setup baseline must be readable immediately; this also catches partial
    // or malformed output before the command reports success.
    await readFile(baseline, "utf8");
  } catch (error) {
    if (!options.force) {
      await Promise.all(
        [config, workflow, baseline].map((path) =>
          rm(path, { force: true }),
        ),
      );
    }
    throw error;
  }
  return { config, baseline, workflow, actionSha };
}

export { DEFAULT_CONFIG };
