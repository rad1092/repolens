import { regressionFindings } from "./sarif.js";
import type { AuditReport, Finding } from "./types.js";

export type ReportStatus =
  | "INCOMPLETE"
  | "REGRESSION BLOCKED"
  | "NO NEW REGRESSIONS"
  | "POLICY PASSED";

export function reportStatus(report: AuditReport): ReportStatus {
  if (report.policy.operationalError) return "INCOMPLETE";
  if (!report.policy.passed) return "REGRESSION BLOCKED";
  return report.comparison.baseline
    ? "NO NEW REGRESSIONS"
    : "POLICY PASSED";
}

export function locationLabel(finding: Finding): string {
  const path = finding.location?.path;
  if (!path) return "repository";
  return finding.location?.line
    ? `${path}:${finding.location.line}`
    : path;
}

export function acceptedFindings(report: AuditReport): Finding[] {
  if (!report.comparison.baseline) return [];
  const regressions = new Set(
    regressionFindings(report).map((finding) => finding.fingerprint),
  );
  return report.findings.filter(
    (finding) =>
      !finding.ignored &&
      !regressions.has(finding.fingerprint) &&
      (finding.severity === "critical" ||
        finding.severity === "warning" ||
        finding.severity === "unknown"),
  );
}
