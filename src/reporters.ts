import type { AuditReport, Finding, Severity } from "./types.js";

const severityLabel: Record<Severity, string> = {
  pass: "PASS",
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
    pass: 32,
    info: 36,
    warning: 33,
    critical: 31,
    unknown: 35,
  };
  return ansi(enabled, colors[severity], severityLabel[severity]);
}

function terminalScore(enabled: boolean, score: number): string {
  const color = score >= 90 ? 32 : score >= 70 ? 33 : 31;
  return ansi(enabled, color, String(score));
}

function terminalFinding(finding: Finding, color: boolean): string[] {
  const deduction =
    finding.deduction > 0 ? `  −${finding.deduction}` : "";
  const lines = [
    `${terminalSeverity(color, finding.severity).padEnd(color ? 17 : 10)} ${finding.title}${deduction}`,
    `           ${finding.summary}`,
  ];

  for (const item of finding.evidence.slice(0, 8)) {
    lines.push(`           ${item.label}: ${String(item.value ?? "unavailable")}`);
  }
  if (finding.evidence.length > 8) {
    lines.push(
      `           … ${finding.evidence.length - 8} more evidence item(s)`,
    );
  }
  if (finding.action) lines.push(`           Action: ${finding.action}`);
  return lines;
}

export function renderTerminal(
  report: AuditReport,
  options: { color: boolean },
): string {
  const github = report.repository.github?.url;
  const target = github ?? report.repository.input;
  const status = report.policy.operationalError
    ? "INCOMPLETE"
    : report.policy.passed
      ? "POLICY PASSED"
      : "ACTION REQUIRED";
  const comparisonLines = report.comparison.baseline
    ? [
        `New    ${report.comparison.new.critical} critical · ${report.comparison.new.warning} warning · ${report.comparison.new.unknown} unknown`,
        `Fixed  ${report.comparison.resolved.critical} critical · ${report.comparison.resolved.warning} warning · ${report.comparison.resolved.unknown} unknown`,
        `Base   ${report.comparison.baseline.generatedAt}  ${report.comparison.baseline.source}`,
      ]
    : [
        `Now    ${report.counts.critical} critical · ${report.counts.warning} warning · ${report.counts.unknown} unknown`,
        "Base   none; current findings are used by new-* policies",
      ];
  const lines = [
    "",
    ansi(options.color, 1, `RepoLens ${report.tool.version}`),
    `${report.repository.name}  ${target}`,
    "",
    ansi(
      options.color,
      report.policy.passed ? 32 : report.policy.operationalError ? 35 : 31,
      `Status ${status}`,
    ),
    ...comparisonLines,
    `Policy ${report.policy.failOn}${report.policy.strict ? " · strict" : ""}`,
    `Score  ${terminalScore(options.color, report.score)}/100 · Grade ${report.grade} (secondary heuristic)`,
    `Scope  ${report.coverage.includedFiles}/${report.coverage.trackedFiles} files included · ${report.coverage.excludedFiles} excluded`,
    "",
    ansi(options.color, 1, "Repository checks"),
    "",
  ];

  for (const finding of report.findings) {
    lines.push(...terminalFinding(finding, options.color), "");
  }

  if (report.comparison.changes.length > 0) {
    lines.push(ansi(options.color, 1, "Changes since baseline"), "");
    for (const change of report.comparison.changes) {
      lines.push(
        `  ${change.kind.toUpperCase().padEnd(9)} ${change.title}: ${change.from ?? "absent"} → ${change.to ?? "absent"}${change.detail ? ` · ${change.detail}` : ""}`,
      );
    }
    lines.push("");
  }

  lines.push(ansi(options.color, 1, "Improvement plan"), "");
  if (report.actions.length === 0) {
    lines.push("  No improvement actions were generated.");
  } else {
    for (const action of report.actions) {
      lines.push(`  ${action.priority}. ${action.action}`);
      lines.push(`     ${action.reason}`);
    }
  }

  lines.push("", "Limitations");
  for (const limitation of report.limitations) {
    lines.push(`  - ${limitation}`);
  }
  lines.push("", `Generated ${report.generatedAt}`, "");
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

export function renderGitHubMarkdown(report: AuditReport): string {
  const status = report.policy.operationalError
    ? "INCOMPLETE"
    : report.policy.passed
      ? "POLICY PASSED"
      : "ACTION REQUIRED";
  const lines = [
    `## RepoLens · ${status}`,
    "",
    `**${escapeMarkdown(report.repository.name)}** · policy \`${report.policy.failOn}${report.policy.strict ? " · strict" : ""}\``,
    "",
  ];

  if (report.comparison.baseline) {
    lines.push(
      `New since baseline: **${report.comparison.new.critical} critical**, **${report.comparison.new.warning} warning**, **${report.comparison.new.unknown} unknown**.`,
      "",
      `Baseline: ${escapeMarkdown(report.comparison.baseline.generatedAt)} · \`${escapeMarkdown(report.comparison.baseline.source)}\``,
      "",
    );
  } else {
    lines.push(
      `Current: **${report.counts.critical} critical**, **${report.counts.warning} warning**, **${report.counts.unknown} unknown**.`,
      "",
    );
  }

  lines.push(
    `Detection scope: ${report.coverage.includedFiles}/${report.coverage.trackedFiles} files included, ${report.coverage.excludedFiles} excluded; npm metadata ${report.coverage.dependencyPackages.checked}/${report.coverage.dependencyPackages.eligible}; GitHub metadata ${report.coverage.github.status}.`,
    "",
    "### Current actionable findings",
    "",
    "| Severity | Check | Result |",
    "| --- | --- | --- |",
  );
  const actionable = report.findings.filter(
    (item) =>
      item.severity === "critical" ||
      item.severity === "warning" ||
      item.severity === "unknown",
  );
  if (actionable.length === 0) {
    lines.push("| PASS | Maintenance queue | No actionable findings |");
  } else {
    for (const finding of actionable) {
      lines.push(
        `| ${severityLabel[finding.severity]} | ${escapeMarkdown(finding.title)} | ${escapeMarkdown(finding.summary)} |`,
      );
    }
  }
  lines.push(
    "",
    `<sub>Score ${report.score}/100 · Grade ${report.grade} is a secondary heuristic. Generated ${escapeMarkdown(report.generatedAt)}.</sub>`,
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

function evidenceValue(value: unknown): string {
  return value === null ? "Unavailable" : String(value);
}

function renderEvidence(finding: Finding): string {
  if (finding.evidence.length === 0) return "";
  return `<dl class="evidence">${finding.evidence
    .map(
      (item) =>
        `<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(evidenceValue(item.value))}</dd></div>`,
    )
    .join("")}</dl>`;
}

function renderFinding(finding: Finding): string {
  const deduction =
    finding.deduction > 0
      ? `<span class="deduction">−${finding.deduction}</span>`
      : "";
  const action = finding.action
    ? `<p class="action"><strong>Action</strong> ${escapeHtml(finding.action)}</p>`
    : "";

  return `<article class="finding finding-${finding.severity}">
    <header>
      <span class="severity">${severityLabel[finding.severity]}</span>
      <h3>${escapeHtml(finding.title)}</h3>
      ${deduction}
    </header>
    <p>${escapeHtml(finding.summary)}</p>
    ${renderEvidence(finding)}
    ${action}
  </article>`;
}

export function renderHtml(report: AuditReport): string {
  const repositoryUrl = report.repository.github?.url;
  const repositoryName = escapeHtml(report.repository.name);
  const target = repositoryUrl
    ? `<a href="${escapeHtml(repositoryUrl)}">${escapeHtml(repositoryUrl)}</a>`
    : `<code>${escapeHtml(report.repository.input)}</code>`;
  const actionMarkup =
    report.actions.length === 0
      ? "<p>No improvement actions were generated.</p>"
      : `<ol>${report.actions
          .map(
            (item) =>
              `<li><strong>${escapeHtml(item.action)}</strong><span>${escapeHtml(item.reason)}</span></li>`,
          )
          .join("")}</ol>`;
  const status = report.policy.operationalError
    ? "Incomplete"
    : report.policy.passed
      ? "Policy passed"
      : "Action required";
  const headlineCounts = report.comparison.baseline
    ? report.comparison.new
    : {
        critical: report.counts.critical,
        warning: report.counts.warning,
        unknown: report.counts.unknown,
      };
  const comparisonMarkup = report.comparison.baseline
    ? `<section aria-labelledby="changes-title">
      <h2 id="changes-title">Changes since baseline</h2>
      <p class="baseline">Compared with ${escapeHtml(report.comparison.baseline.generatedAt)} · <code>${escapeHtml(report.comparison.baseline.source)}</code></p>
      ${
        report.comparison.changes.length === 0
          ? "<p>No actionable finding changed.</p>"
          : `<ol class="changes">${report.comparison.changes
              .map(
                (change) =>
                  `<li><strong>${escapeHtml(change.kind)}</strong><span>${escapeHtml(change.title)}${change.detail ? `<small>${escapeHtml(change.detail)}</small>` : ""}</span><code>${escapeHtml(change.from ?? "absent")} → ${escapeHtml(change.to ?? "absent")}</code></li>`,
              )
              .join("")}</ol>`
      }
    </section>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <title>RepoLens report — ${repositoryName}</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #f6f3ea;
      --surface: #fffdf8;
      --ink: #181a18;
      --muted: #656a63;
      --rule: #cfd2ca;
      --pass: #166534;
      --info: #075985;
      --warn: #92400e;
      --critical: #b91c1c;
      --accent: #3154ff;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); line-height: 1.55; }
    a { color: var(--accent); overflow-wrap: anywhere; }
    code { overflow-wrap: anywhere; }
    main { width: min(100% - 2rem, 76rem); margin: 0 auto; padding: 3rem 0 6rem; }
    .hero { display: grid; grid-template-columns: 1fr auto; gap: 2rem; align-items: end; padding: 2rem 0 3rem; border-bottom: 2px solid var(--ink); }
    .eyebrow, .severity { font: 700 .72rem/1.2 ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: .07em; text-transform: uppercase; }
    h1 { margin: .4rem 0; font-size: clamp(2.8rem, 8vw, 7rem); line-height: .9; letter-spacing: -.055em; }
    .target { margin: 0; color: var(--muted); }
    .status-card { min-width: 15rem; padding: 1.25rem; border: 2px solid currentColor; color: var(--accent); }
    .status-card strong, .status-card span { display: block; }
    .status-card strong { margin-top: .4rem; font-size: 1.65rem; line-height: 1; }
    .status-card span { margin-top: .7rem; color: var(--muted); font-size: .78rem; }
    .counts { display: grid; grid-template-columns: repeat(5, 1fr); gap: 1px; margin: 0 0 4rem; background: var(--rule); border-bottom: 1px solid var(--rule); }
    .counts div { padding: 1.1rem; background: var(--surface); }
    .counts strong { display: block; font-size: 1.6rem; }
    section { margin-top: 4rem; }
    h2 { margin: 0 0 1.5rem; font-size: clamp(1.8rem, 4vw, 3.4rem); letter-spacing: -.04em; }
    .findings { display: grid; gap: .8rem; }
    .finding { padding: 1.25rem; border: 1px solid var(--rule); border-left: .45rem solid var(--info); background: var(--surface); }
    .finding-pass { border-left-color: var(--pass); }
    .finding-warning { border-left-color: var(--warn); }
    .finding-critical { border-left-color: var(--critical); }
    .finding-unknown { border-left-color: #7e22ce; }
    .finding header { display: grid; grid-template-columns: auto 1fr auto; gap: 1rem; align-items: center; }
    .finding h3 { margin: 0; font-size: 1.05rem; }
    .finding > p { margin: .8rem 0 0; }
    .deduction { font-weight: 800; color: var(--critical); }
    .severity { color: var(--info); }
    .finding-pass .severity { color: var(--pass); }
    .finding-warning .severity { color: var(--warn); }
    .finding-critical .severity { color: var(--critical); }
    .finding-unknown .severity { color: #7e22ce; }
    .evidence { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .45rem 1rem; margin: 1rem 0 0; }
    .evidence div { min-width: 0; padding-top: .45rem; border-top: 1px solid var(--rule); }
    dt { color: var(--muted); font: 700 .68rem/1.4 ui-monospace, SFMono-Regular, Consolas, monospace; }
    dd { margin: .2rem 0 0; overflow-wrap: anywhere; }
    .action { padding: .8rem; background: color-mix(in srgb, var(--accent) 8%, transparent); }
    .action strong { margin-right: .5rem; color: var(--accent); }
    .plan ol { display: grid; gap: .75rem; padding-left: 1.5rem; }
    .plan li { padding: 1rem; border-bottom: 1px solid var(--rule); }
    .plan li strong, .plan li span { display: block; }
    .plan li span { margin-top: .35rem; color: var(--muted); }
    .limitations { color: var(--muted); }
    .scope, .baseline { color: var(--muted); }
    .scope code { color: var(--ink); }
    .changes { display: grid; gap: .5rem; padding: 0; list-style: none; }
    .changes li { display: grid; grid-template-columns: 7rem 1fr auto; gap: 1rem; padding: .8rem 0; border-bottom: 1px solid var(--rule); }
    .changes strong { text-transform: uppercase; }
    footer { margin-top: 5rem; padding-top: 1rem; border-top: 2px solid var(--ink); color: var(--muted); font-size: .78rem; }
    @media (max-width: 42rem) {
      main { width: min(100% - 1.25rem, 76rem); padding-top: 1rem; }
      .hero { grid-template-columns: 1fr; }
      .status-card { width: 100%; justify-self: start; }
      .counts { grid-template-columns: repeat(2, 1fr); }
      .finding header { grid-template-columns: 1fr auto; }
      .severity { grid-column: 1 / -1; }
      .evidence { grid-template-columns: 1fr; }
      .changes li { grid-template-columns: 1fr; gap: .25rem; }
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #121512;
        --surface: #1c201c;
        --ink: #f3f2e9;
        --muted: #a9afa7;
        --rule: #3b423b;
        --pass: #86efac;
        --info: #7dd3fc;
        --warn: #fcd34d;
        --critical: #fca5a5;
        --accent: #9eafff;
      }
    }
    @media print {
      :root { color-scheme: light; }
      body { background: #fff; }
      main { width: 100%; padding: 0; }
      .finding { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main>
    <header class="hero">
      <div>
        <p class="eyebrow">RepoLens ${escapeHtml(report.tool.version)} · repository maintenance audit</p>
        <h1>${repositoryName}</h1>
        <p class="target">${target}</p>
      </div>
      <div class="status-card">
        <p class="eyebrow">Policy · ${escapeHtml(report.policy.failOn)}${report.policy.strict ? " · strict" : ""}</p>
        <strong>${status}</strong>
        <span>Score ${report.score}/100 · Grade ${report.grade} · secondary heuristic</span>
      </div>
    </header>

    <div class="counts" aria-label="${report.comparison.baseline ? "New finding" : "Current finding"} counts">
      <div><strong>${headlineCounts.critical}</strong>${report.comparison.baseline ? "New critical" : "Critical"}</div>
      <div><strong>${headlineCounts.warning}</strong>${report.comparison.baseline ? "New warning" : "Warning"}</div>
      <div><strong>${headlineCounts.unknown}</strong>${report.comparison.baseline ? "New unknown" : "Unknown"}</div>
      <div><strong>${report.counts.pass}</strong>Pass</div>
      <div><strong>${report.counts.info}</strong>Info</div>
    </div>

    <section class="scope" aria-labelledby="scope-title">
      <h2 id="scope-title">Detection scope</h2>
      <p><strong>${report.coverage.includedFiles}</strong> of ${report.coverage.trackedFiles} discovered files included; ${report.coverage.excludedFiles} excluded.</p>
      <p>npm metadata ${report.coverage.dependencyPackages.checked}/${report.coverage.dependencyPackages.eligible} (${escapeHtml(report.coverage.dependencyPackages.status)}) · GitHub metadata ${escapeHtml(report.coverage.github.status)}</p>
      ${report.coverage.excludes.length > 0 ? `<p>Exclude globs: <code>${escapeHtml(report.coverage.excludes.join(", "))}</code></p>` : ""}
    </section>

    ${comparisonMarkup}

    <section aria-labelledby="checks-title">
      <h2 id="checks-title">Repository checks</h2>
      <div class="findings">${report.findings.map(renderFinding).join("")}</div>
    </section>

    <section class="plan" aria-labelledby="plan-title">
      <h2 id="plan-title">Improvement plan</h2>
      ${actionMarkup}
    </section>

    <section class="limitations" aria-labelledby="limits-title">
      <h2 id="limits-title">What this report does not prove</h2>
      <ul>${report.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </section>

    <footer>
      Generated ${escapeHtml(report.generatedAt)} by RepoLens ${escapeHtml(report.tool.version)}.
      This static report contains no scripts, remote fonts, analytics, or stored token.
    </footer>
  </main>
</body>
</html>
`.replace(/[ \t]+$/gm, "");
}
