import {
  appendFile,
  mkdir,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  resolveActionBaseline,
  resolveWorkspacePath,
} from "./action-context.js";
import { parseFailOn } from "./config.js";
import { asRepoLensError } from "./errors.js";
import {
  renderGitHubMarkdown,
  renderHtml,
  renderJson,
} from "./reporters.js";
import { runAudit } from "./runner.js";
import {
  regressionFindings,
  renderSarif,
} from "./sarif.js";
import type {
  AuditReport,
  FailOn,
  Finding,
} from "./types.js";

function input(name: string): string {
  const normalized = `INPUT_${name.toUpperCase()}`;
  return (
    process.env[normalized] ??
    process.env[normalized.replaceAll("-", "_")] ??
    ""
  ).trim();
}

function commandEscape(value: string): string {
  return value
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}

function propertyEscape(value: string): string {
  return commandEscape(value)
    .replaceAll(":", "%3A")
    .replaceAll(",", "%2C");
}

function annotation(finding: Finding): string {
  const level =
    finding.severity === "critical"
      ? "error"
      : finding.severity === "warning"
        ? "warning"
        : "notice";
  const properties = [
    `title=${propertyEscape(`RepoLens · ${finding.ruleId ?? finding.title}`)}`,
  ];
  if (finding.location?.path) {
    properties.push(`file=${propertyEscape(finding.location.path)}`);
  }
  if (finding.location?.line) {
    properties.push(`line=${finding.location.line}`);
  }
  if (finding.location?.column) {
    properties.push(`col=${finding.location.column}`);
  }
  return `::${level} ${properties.join(",")}::${commandEscape(finding.summary)}\n`;
}

function emitRegressionAnnotations(report: AuditReport): void {
  const regressions = regressionFindings(report);
  for (const finding of regressions.slice(0, 10)) {
    process.stdout.write(annotation(finding));
  }
  if (regressions.length > 10) {
    process.stdout.write(
      `::warning title=${propertyEscape("RepoLens · additional regressions")}::${regressions.length - 10} additional regression(s) are listed in the job summary and SARIF report.%0A\n`,
    );
  }
}

async function setOutput(
  name: string,
  value: string | number,
): Promise<void> {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) return;
  await appendFile(outputFile, `${name}=${String(value)}\n`, "utf8");
}

function actionDirectory(): string {
  const base = resolve(process.env.RUNNER_TEMP ?? ".repolens-action");
  const suffix = [
    process.env.GITHUB_RUN_ID ?? "local",
    process.env.GITHUB_JOB ?? "job",
    process.env.GITHUB_ACTION ?? "action",
  ]
    .join("-")
    .replaceAll(/[^A-Za-z0-9._-]/g, "_");
  return join(base, `repolens-${suffix}`);
}

async function writeActionReports(
  report: AuditReport,
  sourceRoot: string,
): Promise<{
  json: string;
  html: string;
  markdown: string;
  sarif: string;
}> {
  const output = actionDirectory();
  await mkdir(output, { recursive: true });
  const paths = {
    json: join(output, "repolens-report.json"),
    html: join(output, "repolens-report.html"),
    markdown: join(output, "repolens-summary.md"),
    sarif: join(output, "repolens-results.sarif"),
  };
  const markdown = renderGitHubMarkdown(report);
  await Promise.all([
    writeFile(paths.json, renderJson(report), "utf8"),
    writeFile(paths.html, renderHtml(report), "utf8"),
    writeFile(paths.markdown, markdown, "utf8"),
    writeFile(
      paths.sarif,
      renderSarif(report, sourceRoot),
      "utf8",
    ),
  ]);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown, "utf8");
  }
  return paths;
}

async function publishOutputs(
  report: AuditReport,
  paths: Awaited<ReturnType<typeof writeActionReports>>,
): Promise<void> {
  const regressions = regressionFindings(report);
  const values: Record<string, string | number> = {
    critical: report.comparison.new.critical,
    warning: report.comparison.new.warning,
    unknown: report.comparison.new.unknown,
    new: regressions.length,
    accepted: report.summary?.acceptedDebt ?? 0,
    ignored: report.ignoredFindings?.length ?? 0,
    passed: String(report.policy.passed),
    "report-json": paths.json,
    "report-html": paths.html,
    "report-markdown": paths.markdown,
    "report-sarif": paths.sarif,
  };
  for (const [name, value] of Object.entries(values)) {
    await setOutput(name, value);
  }
}

async function main(): Promise<void> {
  const workspace = resolve(process.env.GITHUB_WORKSPACE ?? process.cwd());
  const runnerTemp = resolve(process.env.RUNNER_TEMP ?? ".repolens-action");
  const targetInput = input("target") || ".";
  const target = resolveWorkspacePath(workspace, targetInput, "target");
  const configInput = input("config");
  const configPath = configInput
    ? resolveWorkspacePath(workspace, configInput, "config")
    : null;
  const baselineInput = input("baseline");
  const baselinePath = baselineInput
    ? await resolveActionBaseline({
        workspace,
        requested: baselineInput,
        eventName: process.env.GITHUB_EVENT_NAME ?? "",
        eventPath: process.env.GITHUB_EVENT_PATH ?? null,
        runnerTemp,
      })
    : null;
  const failOnInput = input("fail-on");
  const failOn: FailOn | null = failOnInput
    ? parseFailOn(failOnInput, "action input fail-on")
    : null;
  const result = await runAudit({
    target,
    configPath,
    baselinePath,
    failOn,
    strict: null,
    offline: false,
    githubToken: process.env.GITHUB_TOKEN || null,
  });
  const paths = await writeActionReports(result.report, target);
  await publishOutputs(result.report, paths);
  emitRegressionAnnotations(result.report);
  process.exitCode = result.exitCode;
}

main().catch((error: unknown) => {
  const failure = asRepoLensError(error);
  process.stdout.write(
    `::error title=${propertyEscape(`RepoLens · ${failure.code}`)}::${commandEscape(failure.message)}\n`,
  );
  process.stderr.write(
    `RepoLens [${failure.code}] ${failure.message}\n`,
  );
  process.exitCode = 2;
});
