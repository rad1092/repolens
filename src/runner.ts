import { stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { escape as escapeGlob } from "minimatch";

import { auditTarget } from "./audit.js";
import { compareWithBaseline, loadBaseline } from "./comparison.js";
import { loadConfig, resolveConfigPath } from "./config.js";
import { evaluatePolicy, policyExitCode } from "./policy.js";
import type {
  AuditReport,
  FailOn,
} from "./types.js";

export interface AuditRunOptions {
  target: string;
  configPath: string | null;
  baselinePath: string | null;
  failOn: FailOn | null;
  strict: boolean | null;
  offline: boolean;
  staleDays: number | null;
  largeFileBytes: number | null;
  maxTodoMatches: number;
  githubToken: string | null;
  now?: Date;
  signal?: AbortSignal;
}

export interface AuditRunResult {
  report: AuditReport;
  exitCode: 0 | 1 | 2;
  configSource: string | null;
}

async function baselinePathInsideTarget(
  target: string,
  baselinePath: string | null,
): Promise<string | null> {
  if (!baselinePath) return null;

  const targetRoot = resolve(target);
  const targetStat = await stat(targetRoot).catch(() => null);
  if (!targetStat?.isDirectory()) return null;

  const relativePath = relative(targetRoot, resolve(baselinePath));
  if (
    relativePath.length === 0 ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    return null;
  }
  return escapeGlob(relativePath.split(sep).join("/"), {
    magicalBraces: true,
  });
}

export async function runAudit(
  options: AuditRunOptions,
): Promise<AuditRunResult> {
  const resolvedConfig = await resolveConfigPath(
    options.target,
    options.configPath,
  );
  const { config, source } = await loadConfig(
    resolvedConfig.path,
    resolvedConfig.required,
  );
  const baselineExclusion = await baselinePathInsideTarget(
    options.target,
    options.baselinePath,
  );
  const excludes = [...config.excludes];
  if (baselineExclusion && !excludes.includes(baselineExclusion)) {
    excludes.push(baselineExclusion);
  }
  const auditOptions = {
    now: options.now ?? new Date(),
    staleDays: options.staleDays ?? config.staleDays,
    largeFileBytes:
      options.largeFileBytes ??
      Math.floor(config.largeFileMB * 1024 * 1024),
    maxTodoMatches: options.maxTodoMatches,
    offline: options.offline,
    githubToken: options.githubToken,
    excludes,
    ...(options.signal ? { signal: options.signal } : {}),
  };

  let report = await auditTarget(options.target, auditOptions);
  if (options.baselinePath) {
    const baseline = await loadBaseline(options.baselinePath);
    report = compareWithBaseline(
      report,
      baseline.report,
      baseline.source,
    );
  }
  report = evaluatePolicy(
    report,
    options.failOn ?? config.policy.failOn,
    options.strict ?? config.policy.strict,
  );
  return {
    report,
    exitCode: policyExitCode(report),
    configSource: source,
  };
}
