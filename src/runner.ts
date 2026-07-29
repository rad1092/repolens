import { isAbsolute, relative, resolve, sep } from "node:path";
import { escape as escapeGlob } from "minimatch";

import { auditPreparedRepository } from "./audit.js";
import {
  compareWithAcceptedBaseline,
  loadAcceptedBaseline,
  validateBaselineCommit,
} from "./baseline.js";
import { loadConfig, resolveConfigPath } from "./config.js";
import { evaluatePolicy, policyExitCode } from "./policy.js";
import { prepareRepository } from "./scanner.js";
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
  githubToken: string | null;
  now?: Date;
  signal?: AbortSignal;
}

export interface AuditRunResult {
  report: AuditReport;
  exitCode: 0 | 1 | 2;
  configSource: string | null;
}

function baselinePathInsideTarget(
  targetRoot: string,
  baselinePath: string | null,
): string | null {
  if (!baselinePath) return null;

  const relativePath = relative(targetRoot, baselinePath);
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
  const prepared = await prepareRepository(
    options.target,
    options.githubToken,
  );
  try {
    const target = prepared.identity.localPath;
    const resolvedConfig = await resolveConfigPath(
      target,
      options.configPath,
    );
    const { config, source } = await loadConfig(
      resolvedConfig.path,
      resolvedConfig.required,
    );
    const baselinePath = options.baselinePath
      ? resolve(target, options.baselinePath)
      : null;
    const baselineExclusion = baselinePathInsideTarget(
      target,
      baselinePath,
    );
    const excludes = [...config.excludes];
    if (baselineExclusion && !excludes.includes(baselineExclusion)) {
      excludes.push(baselineExclusion);
    }
    const auditOptions = {
      now: options.now ?? new Date(),
      offline: options.offline,
      githubToken: options.githubToken,
      excludes,
      checks: config.checks ?? {},
      ...(options.signal ? { signal: options.signal } : {}),
    };

    let report = await auditPreparedRepository(
      prepared.identity,
      auditOptions,
    );
    if (baselinePath) {
      const loaded = await loadAcceptedBaseline(
        baselinePath,
        options.now ?? new Date(),
      );
      await validateBaselineCommit(target, loaded.baseline);
      report = compareWithAcceptedBaseline(
        report,
        loaded.baseline,
        loaded.source,
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
  } finally {
    await prepared.cleanup();
  }
}
