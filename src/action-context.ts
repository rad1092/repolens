import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";

import { RepoLensError } from "./errors.js";
import { runCommand } from "./process.js";

export function resolveWorkspacePath(
  workspace: string,
  requested: string,
  label: string,
): string {
  const root = resolve(workspace);
  const target = resolve(root, requested);
  const scoped = relative(root, target);
  if (
    scoped === ".." ||
    scoped.startsWith(`..${sep}`) ||
    isAbsolute(scoped)
  ) {
    throw new RepoLensError(
      "WORKSPACE_BOUNDARY",
      `${label} must stay inside GITHUB_WORKSPACE.`,
    );
  }
  return target;
}

function eventBaseSha(value: unknown): string | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return null;
  }
  const pullRequest = (value as Record<string, unknown>).pull_request;
  if (
    typeof pullRequest !== "object" ||
    pullRequest === null ||
    Array.isArray(pullRequest)
  ) {
    return null;
  }
  const base = (pullRequest as Record<string, unknown>).base;
  if (
    typeof base !== "object" ||
    base === null ||
    Array.isArray(base)
  ) {
    return null;
  }
  const sha = (base as Record<string, unknown>).sha;
  return typeof sha === "string" && /^[a-f0-9]{40}$/i.test(sha)
    ? sha.toLowerCase()
    : null;
}

export async function resolveActionBaseline(options: {
  workspace: string;
  requested: string;
  eventName: string;
  eventPath: string | null;
  runnerTemp: string;
}): Promise<string> {
  const workspaceBaseline = resolveWorkspacePath(
    options.workspace,
    options.requested,
    "baseline",
  );
  if (options.eventName !== "pull_request") return workspaceBaseline;
  if (!options.eventPath) {
    throw new RepoLensError(
      "BASELINE_INVALID",
      "GITHUB_EVENT_PATH is required to protect a pull-request baseline.",
    );
  }
  let event: unknown;
  try {
    event = JSON.parse(await readFile(options.eventPath, "utf8")) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new RepoLensError(
      "BASELINE_INVALID",
      `Could not read the pull-request event: ${detail}`,
    );
  }
  const baseSha = eventBaseSha(event);
  if (!baseSha) {
    throw new RepoLensError(
      "BASELINE_INVALID",
      "The pull-request base commit SHA is unavailable.",
    );
  }
  const baselineRelative = relative(
    resolve(options.workspace),
    workspaceBaseline,
  ).split(sep).join("/");
  if (baselineRelative.includes(":")) {
    throw new RepoLensError(
      "BASELINE_INVALID",
      "The baseline path cannot contain a colon.",
    );
  }
  let base = await runCommand(
    "git",
    ["show", `${baseSha}:${baselineRelative}`],
    { cwd: options.workspace, allowFailure: true },
  );
  if (!base) {
    await runCommand(
      "git",
      ["fetch", "--no-tags", "--depth=1", "origin", baseSha],
      { cwd: options.workspace, allowFailure: true, timeoutMs: 60_000 },
    );
    base = await runCommand(
      "git",
      ["show", `${baseSha}:${baselineRelative}`],
      { cwd: options.workspace, allowFailure: true },
    );
  }
  if (!base) {
    throw new RepoLensError(
      "BASELINE_INVALID",
      `The baseline ${baselineRelative} was not present at pull-request base ${baseSha}.`,
    );
  }
  const current = await readFile(workspaceBaseline, "utf8").catch(() => null);
  if (current !== base.stdout) {
    throw new RepoLensError(
      "BASELINE_TAMPERED",
      `Pull requests cannot change ${baselineRelative} while using it to approve their own regressions. Accept debt in a separately reviewed baseline update.`,
    );
  }
  const destination = resolve(
    options.runnerTemp,
    "repolens-base-baseline",
    `${baseSha}.json`,
  );
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, base.stdout, {
    encoding: "utf8",
    mode: 0o600,
  });
  return destination;
}
