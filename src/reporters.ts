import { regressionFindings } from "./sarif.js";
import type { AuditReport, Finding, Severity } from "./types.js";

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

function locationLabel(finding: Finding): string {
  const path = finding.location?.path;
  if (!path) return "repository";
  return finding.location?.line
    ? `${path}:${finding.location.line}`
    : path;
}

function acceptedFindings(report: AuditReport): Finding[] {
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
  const status = report.policy.operationalError
    ? "INCOMPLETE"
    : report.policy.passed
      ? report.comparison.baseline
        ? "NO NEW REGRESSIONS"
        : "POLICY PASSED"
      : "REGRESSION BLOCKED";
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
  const status = report.policy.operationalError
    ? "INCOMPLETE"
    : report.policy.passed
      ? "NO NEW REGRESSIONS"
      : "REGRESSION BLOCKED";
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

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function htmlFindings(findings: Finding[]): string {
  if (findings.length === 0) return "<p>None.</p>";
  return findings
    .map(
      (finding) => `<article class="${escapeHtml(finding.severity)}">
  <p><strong>${escapeHtml(finding.ruleId ?? finding.id)}</strong> <code>${escapeHtml(locationLabel(finding))}</code></p>
  <p>${escapeHtml(finding.summary)}</p>
  ${finding.remediation ? `<p><b>Fix</b> ${escapeHtml(finding.remediation)}</p>` : ""}
</article>`,
    )
    .join("");
}

export function renderHtml(report: AuditReport): string {
  const regressions = regressionFindings(report);
  const accepted = acceptedFindings(report);
  const title = `${report.repository.name} · RepoLens`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'">
  <title>${escapeHtml(title)}</title>
  <style>
    :root{color-scheme:light dark;font:16px/1.5 system-ui,sans-serif}body{max-width:920px;margin:0 auto;padding:40px 20px}header,article{border:1px solid #8886;border-radius:12px;padding:18px;margin:14px 0}h1,h2,p{margin:0 0 10px}.critical{border-left:6px solid #d1242f}.warning{border-left:6px solid #bf8700}.unknown{border-left:6px solid #8250df}code{overflow-wrap:anywhere}.counts{display:flex;gap:20px;flex-wrap:wrap}
  </style>
</head>
<body>
  <header>
    <p>RepoLens ${escapeHtml(report.tool.version)}</p>
    <h1>${escapeHtml(report.repository.name)}</h1>
    <p class="counts"><b>${regressions.length} new</b><span>${accepted.length} accepted</span><span>${report.summary?.unknownCoverage ?? report.counts.unknown} unknown</span><span>${report.ignoredFindings?.length ?? 0} ignored</span></p>
  </header>
  <main>
    <h2>New regressions</h2>
    ${htmlFindings(regressions)}
    ${accepted.length > 0 ? `<h2>Accepted debt</h2>${htmlFindings(accepted)}` : ""}
  </main>
  <footer><p>Configured commands were not executed. Generated ${escapeHtml(report.generatedAt)}.</p></footer>
</body>
</html>
`;
}
