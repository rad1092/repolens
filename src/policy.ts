import type {
  AuditReport,
  FailOn,
  PolicyResult,
} from "./types.js";

export function evaluatePolicy(
  report: AuditReport,
  failOn: FailOn,
  strict: boolean,
): AuditReport {
  const hasBaseline = report.comparison.baseline !== null;
  const currentCritical = report.counts.critical;
  const currentWarning = report.counts.warning;
  const newCritical = hasBaseline
    ? report.comparison.new.critical
    : currentCritical;
  const newWarning = hasBaseline
    ? report.comparison.new.warning
    : currentWarning;
  const reasons: string[] = [];

  if (failOn === "critical" && currentCritical > 0) {
    reasons.push(`${currentCritical} current critical finding(s)`);
  }
  if (
    failOn === "warning" &&
    currentCritical + currentWarning > 0
  ) {
    reasons.push(
      `${currentCritical} current critical and ${currentWarning} current warning finding(s)`,
    );
  }
  if (failOn === "new-critical" && newCritical > 0) {
    reasons.push(
      `${newCritical} ${hasBaseline ? "new or worsened" : "current"} critical finding(s)`,
    );
  }
  if (
    failOn === "new-warning" &&
    newCritical + newWarning > 0
  ) {
    reasons.push(
      `${newCritical} ${hasBaseline ? "new or worsened" : "current"} critical and ${newWarning} ${hasBaseline ? "new or worsened" : "current"} warning finding(s)`,
    );
  }

  const operationalError = strict && report.counts.unknown > 0;
  if (operationalError) {
    reasons.push(
      `${report.counts.unknown} unknown finding(s) cannot pass in strict mode`,
    );
  }
  const result: PolicyResult = {
    failOn,
    strict,
    passed: reasons.length === 0,
    operationalError,
    reasons,
  };
  return { ...report, policy: result };
}

export function policyExitCode(report: AuditReport): 0 | 1 | 2 {
  if (report.policy.operationalError) return 2;
  return report.policy.passed ? 0 : 1;
}
