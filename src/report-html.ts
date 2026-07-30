import {
  acceptedFindings,
  locationLabel,
  reportStatus,
} from "./report-view.js";
import { regressionFindings } from "./sarif.js";
import type {
  AuditReport,
  Evidence,
  Finding,
  Severity,
} from "./types.js";

const severityLabel: Record<Severity, string> = {
  info: "INFO",
  warning: "WARNING",
  critical: "CRITICAL",
  unknown: "UNKNOWN",
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function statusOf(report: AuditReport): {
  label: string;
  tone: "passed" | "blocked" | "incomplete";
} {
  const status = reportStatus(report);
  return {
    label:
      status === "INCOMPLETE" ? "INSPECTION INCOMPLETE" : status,
    tone:
      status === "INCOMPLETE"
        ? "incomplete"
        : status === "REGRESSION BLOCKED"
          ? "blocked"
          : "passed",
  };
}

function evidenceTable(evidence: Evidence[]): string {
  if (evidence.length === 0) return "";
  const rows = evidence
    .map(
      (item) => `<tr>
  <th scope="row">${escapeHtml(item.label)}</th>
  <td><code>${escapeHtml(item.value)}</code></td>
</tr>`,
    )
    .join("");
  return `<details>
  <summary>Evidence (${evidence.length})</summary>
  <div class="table-wrap">
    <table><tbody>${rows}</tbody></table>
  </div>
</details>`;
}

function findingCards(findings: Finding[], empty: string): string {
  if (findings.length === 0) {
    return `<p class="empty">${escapeHtml(empty)}</p>`;
  }
  return findings
    .map(
      (finding) => `<article class="finding ${escapeHtml(finding.severity)}">
  <div class="finding-heading">
    <span class="severity">${severityLabel[finding.severity]}</span>
    <code>${escapeHtml(finding.ruleId ?? finding.id)}</code>
    <code class="location">${escapeHtml(locationLabel(finding))}</code>
  </div>
  <h3>${escapeHtml(finding.title)}</h3>
  <p>${escapeHtml(finding.summary)}</p>
  ${
    finding.remediation
      ? `<p class="remediation"><strong>Fix</strong> ${escapeHtml(finding.remediation)}</p>`
      : ""
  }
  ${
    finding.fingerprint
      ? `<p class="fingerprint">Finding ID <code>${escapeHtml(finding.fingerprint)}</code></p>`
      : ""
  }
  ${evidenceTable(finding.evidence)}
</article>`,
    )
    .join("");
}

function ignoredFindings(report: AuditReport): string {
  const findings = report.ignoredFindings ?? [];
  if (findings.length === 0) return "";
  const rows = findings
    .map(
      (finding) => `<tr>
  <td><code>${escapeHtml(finding.ruleId ?? finding.id)}</code></td>
  <td><code>${escapeHtml(locationLabel(finding))}</code></td>
  <td>${escapeHtml(finding.ignored?.reason)}</td>
  <td><time>${escapeHtml(finding.ignored?.expiresAt)}</time></td>
</tr>`,
    )
    .join("");
  return `<section aria-labelledby="ignored-heading">
  <h2 id="ignored-heading">Reviewed ignores</h2>
  <p class="section-note">Temporary exceptions remain visible until they expire.</p>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Rule</th><th>Location</th><th>Reason</th><th>Expires</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</section>`;
}

function configuredEvidence(report: AuditReport): string {
  if (!report.configured || report.configured.length === 0) return "";
  const rows = report.configured
    .map(
      (item) => `<tr>
  <td>${escapeHtml(item.area)}</td>
  <td><code>${escapeHtml(item.evidence)}</code></td>
  <td>Not executed</td>
</tr>`,
    )
    .join("");
  return `<section aria-labelledby="configured-heading">
  <h2 id="configured-heading">Configured evidence</h2>
  <p class="section-note">RepoLens verifies configuration and command reachability. It does not execute audited repository scripts.</p>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Area</th><th>Evidence</th><th>Verification</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</section>`;
}

function limitations(report: AuditReport): string {
  if (report.limitations.length === 0) return "";
  return `<section aria-labelledby="limitations-heading">
  <h2 id="limitations-heading">Scope and limitations</h2>
  <ul>${report.limitations
    .map((limitation) => `<li>${escapeHtml(limitation)}</li>`)
    .join("")}</ul>
</section>`;
}

export function renderHtml(report: AuditReport): string {
  const regressions = regressionFindings(report);
  const accepted = acceptedFindings(report);
  const observations = report.findings.filter(
    (finding) => finding.severity === "info" && !finding.ignored,
  );
  const status = statusOf(report);
  const title = `${report.repository.name} · RepoLens`;
  const repository =
    report.repository.github?.url ?? report.repository.input;
  const baseline = report.comparison.baseline;
  const policyReasons =
    report.policy.reasons.length === 0
      ? ""
      : `<ul class="policy-reasons">${report.policy.reasons
          .map((reason) => `<li>${escapeHtml(reason)}</li>`)
          .join("")}</ul>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'">
  <meta name="generator" content="RepoLens ${escapeHtml(report.tool.version)}">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light dark;
      --canvas: #f6f8fa;
      --surface: #fff;
      --surface-alt: #f0f3f6;
      --ink: #1f2328;
      --muted: #59636e;
      --line: #d0d7de;
      --green: #1a7f37;
      --red: #cf222e;
      --amber: #9a6700;
      --purple: #8250df;
      --blue: #0969da;
      font: 15px/1.55 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      max-width: 1100px;
      margin: 0 auto;
      padding: 36px 22px 56px;
      color: var(--ink);
      background: var(--canvas);
    }
    h1, h2, h3, p { margin-top: 0; }
    h1 { margin-bottom: .2rem; font-size: clamp(2rem, 5vw, 3.4rem); letter-spacing: -.045em; }
    h2 { margin-bottom: .35rem; font-size: 1.45rem; letter-spacing: -.02em; }
    h3 { margin-bottom: .45rem; font-size: 1.05rem; }
    code {
      overflow-wrap: anywhere;
      font: 13px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace;
    }
    header.hero, section {
      margin-bottom: 20px;
      padding: 22px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: var(--surface);
    }
    .eyebrow, .section-note, .meta, .fingerprint { color: var(--muted); }
    .eyebrow {
      margin-bottom: .35rem;
      font-size: .76rem;
      font-weight: 750;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .status {
      display: inline-flex;
      margin: .7rem 0 1.2rem;
      padding: .35rem .62rem;
      border-radius: 999px;
      color: #fff;
      font-size: .76rem;
      font-weight: 800;
      letter-spacing: .04em;
    }
    .status.passed { background: var(--green); }
    .status.blocked { background: var(--red); }
    .status.incomplete { background: var(--purple); }
    .metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }
    .metric {
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: var(--surface-alt);
    }
    .metric strong { display: block; font-size: 1.55rem; }
    .metric span { color: var(--muted); font-size: .8rem; }
    .facts {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0 24px;
      margin: 18px 0 0;
    }
    .facts div {
      display: grid;
      grid-template-columns: 9rem 1fr;
      padding: .5rem 0;
      border-top: 1px solid var(--line);
    }
    .facts dt { color: var(--muted); }
    .facts dd { margin: 0; overflow-wrap: anywhere; }
    .policy-reasons { margin: 14px 0 0; padding-left: 1.2rem; }
    .finding {
      margin-top: 12px;
      padding: 17px;
      border: 1px solid var(--line);
      border-left-width: 5px;
      border-radius: 10px;
      background: var(--surface-alt);
    }
    .finding.critical { border-left-color: var(--red); }
    .finding.warning { border-left-color: var(--amber); }
    .finding.unknown { border-left-color: var(--purple); }
    .finding.info { border-left-color: var(--blue); }
    .finding-heading {
      display: flex;
      flex-wrap: wrap;
      gap: .45rem .7rem;
      align-items: center;
      margin-bottom: .7rem;
    }
    .severity { font-size: .68rem; font-weight: 850; letter-spacing: .06em; }
    .location { margin-left: auto; color: var(--muted); }
    .remediation { padding-top: .8rem; border-top: 1px solid var(--line); }
    .fingerprint { margin-bottom: .65rem; font-size: .75rem; }
    .empty {
      margin: 1rem 0 0;
      padding: 1rem;
      border: 1px dashed var(--line);
      border-radius: 10px;
      color: var(--muted);
    }
    details { margin-top: .7rem; }
    summary { cursor: pointer; color: var(--muted); font-size: .82rem; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; margin-top: .75rem; border-collapse: collapse; font-size: .85rem; }
    th, td {
      padding: .65rem .7rem;
      border: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
    }
    th { background: var(--surface-alt); }
    ul { margin-bottom: 0; padding-left: 1.3rem; }
    footer { padding: 12px 2px; color: var(--muted); font-size: .78rem; }
    @media (prefers-color-scheme: dark) {
      :root {
        --canvas: #0d1117;
        --surface: #161b22;
        --surface-alt: #0d1117;
        --ink: #e6edf3;
        --muted: #9198a1;
        --line: #30363d;
        --green: #238636;
        --red: #da3633;
        --amber: #d29922;
        --purple: #8957e5;
        --blue: #2f81f7;
      }
    }
    @media (max-width: 700px) {
      body { padding: 18px 12px 40px; }
      .metrics, .facts { grid-template-columns: 1fr 1fr; }
      .facts div { display: block; }
      .facts dd { margin-top: .15rem; }
      .location { width: 100%; margin-left: 0; }
    }
    @media print {
      :root { color-scheme: light; }
      body { max-width: none; padding: 0; background: #fff; }
      header.hero, section { break-inside: avoid; border-color: #bbb; }
      .finding { break-inside: avoid; }
      details, details > * { display: block; }
      .status {
        border: 1px solid currentColor;
        color: var(--ink);
        background: none !important;
      }
    }
  </style>
</head>
<body>
  <header class="hero">
    <p class="eyebrow">RepoLens ${escapeHtml(report.tool.version)} · offline report</p>
    <h1>${escapeHtml(report.repository.name)}</h1>
    <p class="meta">${escapeHtml(repository)}</p>
    <p class="status ${status.tone}">STATUS ${status.label}</p>
    <div class="metrics" aria-label="Finding summary">
      <div class="metric"><strong>${regressions.length}</strong><span>New regressions</span></div>
      <div class="metric"><strong>${accepted.length}</strong><span>Accepted debt</span></div>
      <div class="metric"><strong>${report.summary?.unknownCoverage ?? report.counts.unknown}</strong><span>Unknown coverage</span></div>
      <div class="metric"><strong>${report.ignoredFindings?.length ?? 0}</strong><span>Reviewed ignores</span></div>
    </div>
    <dl class="facts">
      <div><dt>Policy</dt><dd><code>${escapeHtml(report.policy.failOn)}</code>${report.policy.strict ? " · strict" : ""}</dd></div>
      <div><dt>Files</dt><dd>${report.coverage.includedFiles}/${report.coverage.trackedFiles} included · ${report.coverage.excludedFiles} excluded</dd></div>
      <div><dt>npm metadata</dt><dd>${escapeHtml(report.coverage.dependencyPackages.status)} · ${report.coverage.dependencyPackages.checked}/${report.coverage.dependencyPackages.eligible} checked</dd></div>
      <div><dt>Baseline</dt><dd>${baseline ? `${escapeHtml(baseline.source)} · ${escapeHtml(baseline.generatedAt)}` : "None"}</dd></div>
      <div><dt>Generated</dt><dd><time>${escapeHtml(report.generatedAt)}</time></dd></div>
      <div><dt>Report schema</dt><dd>${report.schemaVersion}</dd></div>
    </dl>
    ${policyReasons}
  </header>
  <main>
    <section aria-labelledby="new-heading">
      <h2 id="new-heading">New regressions</h2>
      <p class="section-note">Only new or worsened findings are gate candidates when a reviewed baseline is present.</p>
      ${findingCards(regressions, "No new regressions.")}
    </section>
    ${
      accepted.length > 0
        ? `<section aria-labelledby="accepted-heading">
      <h2 id="accepted-heading">Accepted debt</h2>
      <p class="section-note">These findings were present in the reviewed baseline and remain visible without repeated annotations.</p>
      ${findingCards(accepted, "No accepted debt.")}
    </section>`
        : ""
    }
    ${
      observations.length > 0
        ? `<section aria-labelledby="observations-heading">
      <h2 id="observations-heading">Updater observations</h2>
      <p class="section-note">Update availability is context for a maintainer, not vulnerability evidence.</p>
      ${findingCards(observations, "No updater observations.")}
    </section>`
        : ""
    }
    ${ignoredFindings(report)}
    ${configuredEvidence(report)}
    ${limitations(report)}
  </main>
  <footer>Self-contained report. No scripts, remote fonts, analytics, or network requests. Generated by RepoLens ${escapeHtml(report.tool.version)}.</footer>
</body>
</html>
`;
}
