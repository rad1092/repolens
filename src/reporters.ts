import { regressionFindings } from "./sarif.js";
import {
  acceptedFindings,
  locationLabel,
  reportStatus,
} from "./report-view.js";
import type { AuditReport, Finding, Severity } from "./types.js";

export { renderHtml } from "./report-html.js";

const severityLabel: Record<Severity, string> = {
  info: "INFO",
  warning: "WARN",
  critical: "CRITICAL",
  unknown: "UNKNOWN",
};

function ansi(enabled: boolean, code: number, value: string): string {
  return enabled ? `\u001B[${code}m${value}\u001B[0m` : value;
}

function terminalSeverity(enabled: boolean, severity: Severity): string {
  const colors: Record<Severity, number> = {
    info: 36,
    warning: 33,
    critical: 31,
    unknown: 35,
  };
  return ansi(enabled, colors[severity], severityLabel[severity]);
}

function terminalFinding(finding: Finding, color: boolean): string[] {
  return [
    `${terminalSeverity(color, finding.severity).padEnd(color ? 17 : 10)} ${finding.ruleId ?? finding.id}`,
    `           ${locationLabel(finding)} · ${finding.summary}`,
    ...(finding.remediation
      ? [`           Fix: ${finding.remediation}`]
      : []),
    ...(finding.fingerprint
      ? [`           ID: ${finding.fingerprint.slice(0, 12)}`]
      : []),
  ];
}

export function renderTerminal(
  report: AuditReport,
  options: { color: boolean },
): string {
  const regressions = regressionFindings(report);
  const accepted = acceptedFindings(report);
  const observations = report.findings.filter(
    (finding) => finding.severity === "info" && !finding.ignored,
  );
  const status = reportStatus(report);
  const lines = [
    "",
    ansi(options.color, 1, `RepoLens ${report.tool.version}`),
    `${report.repository.name}  ${report.repository.github?.url ?? report.repository.input}`,
    "",
    ansi(
      options.color,
      report.policy.passed ? 32 : report.policy.operationalError ? 35 : 31,
      `Status ${status}`,
    ),
    `New      ${regressions.length}`,
    `Accepted ${accepted.length}`,
    `Unknown  ${report.summary?.unknownCoverage ?? report.counts.unknown}`,
    `Ignored  ${report.ignoredFindings?.length ?? 0}`,
    `Policy   ${report.policy.failOn}${report.policy.strict ? " · strict" : ""}`,
    `Scope    ${report.coverage.includedFiles}/${report.coverage.trackedFiles} files included · ${report.coverage.excludedFiles} excluded`,
  ];

  lines.push("", ansi(options.color, 1, "New regressions"), "");
  if (regressions.length === 0) lines.push("  None.");
  for (const finding of regressions) {
    lines.push(...terminalFinding(finding, options.color), "");
  }

  if (accepted.length > 0) {
    lines.push(ansi(options.color, 1, "Accepted debt"), "");
    for (const finding of accepted) {
      lines.push(...terminalFinding(finding, options.color), "");
    }
  }

  if (report.ignoredFindings && report.ignoredFindings.length > 0) {
    lines.push(ansi(options.color, 1, "Ignored by reviewed config"), "");
    for (const finding of report.ignoredFindings) {
      lines.push(
        `  ${finding.ruleId} · ${locationLabel(finding)}`,
        `  ${finding.ignored?.reason} · expires ${finding.ignored?.expiresAt}`,
        "",
      );
    }
  }

  if (observations.length > 0) {
    lines.push(ansi(options.color, 1, "Updater observations"), "");
    for (const finding of observations) {
      lines.push(`  ${finding.summary} · ${locationLabel(finding)}`);
    }
    lines.push("");
  }

  if (report.configured && report.configured.length > 0) {
    lines.push(
      ansi(options.color, 1, "Configured evidence (not executed)"),
      "",
    );
    for (const item of report.configured) {
      lines.push(`  ${item.area}: ${item.evidence}`);
    }
    lines.push("");
  }

  if (report.policy.reasons.length > 0) {
    lines.push(ansi(options.color, 1, "Gate reason"), "");
    for (const reason of report.policy.reasons) lines.push(`  ${reason}`);
    lines.push("");
  }
  lines.push(`Generated ${report.generatedAt}`, "");
  return lines.join("\n");
}

export function renderJson(report: AuditReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function escapeMarkdown(value: unknown): string {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll("\r", " ")
    .replaceAll("\n", " ");
}

function markdownTable(findings: Finding[]): string[] {
  if (findings.length === 0) return ["None.", ""];
  const lines = [
    "| Severity | Rule | Location | Result |",
    "| --- | --- | --- | --- |",
  ];
  for (const finding of findings) {
    lines.push(
      `| ${severityLabel[finding.severity]} | \`${escapeMarkdown(finding.ruleId ?? finding.id)}\` | \`${escapeMarkdown(locationLabel(finding))}\` | ${escapeMarkdown(finding.summary)} |`,
    );
  }
  return [...lines, ""];
}

export function renderGitHubMarkdown(report: AuditReport): string {
  const regressions = regressionFindings(report);
  const accepted = acceptedFindings(report);
  const status = reportStatus(report);
  const lines = [
    `## RepoLens · ${status}`,
    "",
    `**${escapeMarkdown(report.repository.name)}** · policy \`${report.policy.failOn}${report.policy.strict ? " · strict" : ""}\``,
    "",
    `**${regressions.length} new** · **${accepted.length} accepted** · **${report.summary?.unknownCoverage ?? report.counts.unknown} unknown** · **${report.ignoredFindings?.length ?? 0} ignored**`,
    "",
    "### New regressions",
    "",
    ...markdownTable(regressions),
  ];
  if (accepted.length > 0) {
    lines.push("### Accepted debt", "", ...markdownTable(accepted));
  }
  if (report.ignoredFindings && report.ignoredFindings.length > 0) {
    lines.push(
      "### Reviewed ignores",
      "",
      "| Rule | Location | Reason | Expires |",
      "| --- | --- | --- | --- |",
    );
    for (const finding of report.ignoredFindings) {
      lines.push(
        `| \`${escapeMarkdown(finding.ruleId)}\` | \`${escapeMarkdown(locationLabel(finding))}\` | ${escapeMarkdown(finding.ignored?.reason)} | ${escapeMarkdown(finding.ignored?.expiresAt)} |`,
      );
    }
    lines.push("");
  }
  lines.push(
    `<sub>Detection scope ${report.coverage.includedFiles}/${report.coverage.trackedFiles} files. Configured commands were not executed. Generated ${escapeMarkdown(report.generatedAt)}.</sub>`,
    "",
  );
  return lines.join("\n");
}
