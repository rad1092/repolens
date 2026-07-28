import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { parseFailOn } from "./config.js";
import {
  renderGitHubMarkdown,
  renderHtml,
  renderJson,
} from "./reporters.js";
import { runAudit } from "./runner.js";
import type { AuditReport, FailOn, Finding } from "./types.js";

function input(name: string): string {
  const normalized = `INPUT_${name.toUpperCase().replaceAll(" ", "_")}`;
  const underscored = normalized.replaceAll("-", "_");
  return (process.env[normalized] ?? process.env[underscored] ?? "").trim();
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

function annotate(
  level: "error" | "warning" | "notice",
  finding: Finding,
): void {
  process.stdout.write(
    `::${level} title=${propertyEscape(`RepoLens · ${finding.title}`)}::${commandEscape(finding.summary)}\n`,
  );
}

async function setOutput(name: string, value: string | number): Promise<void> {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) return;
  await appendFile(outputFile, `${name}=${String(value)}\n`, "utf8");
}

function actionDirectory(): string {
  const base = process.env.RUNNER_TEMP
    ? resolve(process.env.RUNNER_TEMP)
    : resolve(".repolens-action");
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
): Promise<{
  json: string;
  html: string;
  markdown: string;
}> {
  const output = actionDirectory();
  await mkdir(output, { recursive: true });
  const paths = {
    json: join(output, "repolens-report.json"),
    html: join(output, "repolens-report.html"),
    markdown: join(output, "repolens-summary.md"),
  };
  const markdown = renderGitHubMarkdown(report);
  await Promise.all([
    writeFile(paths.json, renderJson(report), "utf8"),
    writeFile(paths.html, renderHtml(report), "utf8"),
    writeFile(paths.markdown, markdown, "utf8"),
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
  const values: Record<string, string | number> = {
    score: report.score,
    grade: report.grade,
    critical: report.counts.critical,
    warning: report.counts.warning,
    unknown: report.counts.unknown,
    "new-critical": report.comparison.baseline
      ? report.comparison.new.critical
      : report.counts.critical,
    "new-warning": report.comparison.baseline
      ? report.comparison.new.warning
      : report.counts.warning,
    passed: String(report.policy.passed),
    "report-json": paths.json,
    "report-html": paths.html,
    "report-markdown": paths.markdown,
  };
  for (const [name, value] of Object.entries(values)) {
    await setOutput(name, value);
  }
}

function emitAnnotations(report: AuditReport): void {
  for (const finding of report.findings) {
    if (finding.severity === "critical") annotate("error", finding);
    else if (finding.severity === "warning") annotate("warning", finding);
    else if (finding.severity === "unknown") annotate("notice", finding);
  }
}

async function main(): Promise<void> {
  const workspace = resolve(process.env.GITHUB_WORKSPACE ?? process.cwd());
  const targetInput = input("target") || ".";
  const target = targetInput === "." ? workspace : resolve(workspace, targetInput);
  const configInput = input("config");
  const baselineInput = input("baseline");
  const failOnInput = input("fail-on");
  const failOn: FailOn | null = failOnInput
    ? parseFailOn(failOnInput, "action input fail-on")
    : null;
  const result = await runAudit({
    target,
    configPath: configInput ? resolve(workspace, configInput) : null,
    baselinePath: baselineInput ? resolve(workspace, baselineInput) : null,
    failOn,
    strict: null,
    offline: false,
    staleDays: null,
    largeFileBytes: null,
    maxTodoMatches: 50,
    githubToken: process.env.GITHUB_TOKEN || null,
  });
  const paths = await writeActionReports(result.report);
  await publishOutputs(result.report, paths);
  emitAnnotations(result.report);
  process.exitCode = result.exitCode;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(
    `::error title=${propertyEscape("RepoLens execution error")}::${commandEscape(message)}\n`,
  );
  process.stderr.write(`RepoLens: ${message}\n`);
  process.exitCode = 2;
});
