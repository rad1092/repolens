#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadAcceptedBaseline,
  validateBaselineCommit,
} from "./baseline.js";
import {
  loadConfig,
  parseFailOn,
  resolveConfigPath,
  writeDefaultConfig,
} from "./config.js";
import { TOOL_VERSION } from "./constants.js";
import { asRepoLensError, RepoLensError } from "./errors.js";
import {
  renderGitHubMarkdown,
  renderHtml,
  renderJson,
  renderTerminal,
} from "./reporters.js";
import { RULES } from "./rules.js";
import { runAudit } from "./runner.js";
import { renderSarif } from "./sarif.js";
import {
  acceptCurrentBaseline,
  DEFAULT_BASELINE_PATH,
  setupRepository,
} from "./setup.js";
import type {
  BaselineAcceptCliOptions,
  BaselineCheckCliOptions,
  CliOptions,
  DoctorCliOptions,
  ExplainCliOptions,
  InitCliOptions,
  ReportFormat,
  ScanCliOptions,
  SetupCliOptions,
} from "./types.js";

const HELP = `RepoLens ${TOOL_VERSION}
Block new Node + GitHub repository-maintenance regressions.

Usage:
  repolens setup [directory] [options]
  repolens scan [target] [options]
  repolens compare [target] --baseline <baseline.json> [options]
  repolens baseline accept [target] [options]
  repolens baseline check [target] [options]
  repolens doctor [target]
  repolens explain <rule-id>

Setup and acceptance:
  --reason <text>       Why current debt is accepted
  --owner <name>        Reviewer responsible for the acceptance
  --expires <ISO time>  Acceptance expiration (default: 90 days)
  --action-sha <sha>    Immutable Action commit; resolved from this release by default
  --from-v2 <report>    Record an explicit migration from a reviewed v2 report
  --force               Replace the requested setup or baseline file

Scan and compare:
  -f, --format <value>  terminal,json,html,github,sarif,all
  -o, --output <path>   Report file or directory
  --config <path>       Explicit .repolens.json
  --baseline <path>     Compact RepoLens baseline schemaVersion 3
  --fail-on <policy>    none,critical,warning,new-critical,new-warning
  --strict              Exit 2 when requested coverage is unknown
  --offline             Skip optional npm registry metadata
  --token-env <name>    Token used to clone a private GitHub target (default: GITHUB_TOKEN)

Exit codes:
  0  Gate passed
  1  Maintenance policy blocked a regression
  2  Configuration, baseline, coverage, or execution was incomplete

RepoLens validates configuration and wiring. It never executes audited scripts.
`;

function optionValue(
  argument: string,
  args: string[],
  index: number,
): { value: string; consumed: number } {
  const equals = argument.indexOf("=");
  if (equals >= 0) {
    const value = argument.slice(equals + 1);
    if (!value) {
      throw new RepoLensError(
        "EXECUTION_FAILED",
        `${argument.slice(0, equals)} requires a value.`,
      );
    }
    return { value, consumed: 0 };
  }
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new RepoLensError(
      "EXECUTION_FAILED",
      `${argument} requires a value.`,
    );
  }
  return { value, consumed: 1 };
}

function parseFormats(value: string): ReportFormat[] {
  const requested = value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const expanded = requested.includes("all")
    ? ["terminal", "json", "html", "github", "sarif"]
    : requested;
  const allowed = new Set([
    "terminal",
    "json",
    "html",
    "github",
    "sarif",
  ]);
  for (const format of expanded) {
    if (!allowed.has(format)) {
      throw new RepoLensError(
        "EXECUTION_FAILED",
        `Unknown report format: ${format}`,
      );
    }
  }
  if (expanded.length === 0) {
    throw new RepoLensError(
      "EXECUTION_FAILED",
      "At least one format is required.",
    );
  }
  return [...new Set(expanded as ReportFormat[])];
}

function parseInit(args: string[]): InitCliOptions {
  let target = ".";
  let force = false;
  for (const argument of args) {
    if (argument === "--force") force = true;
    else if (!argument.startsWith("-") && target === ".") target = argument;
    else {
      throw new RepoLensError(
        "EXECUTION_FAILED",
        `Unknown init argument: ${argument}`,
      );
    }
  }
  return { command: "init", target, force };
}

function parseAcceptanceArgs(
  args: string[],
  command: "setup" | "baseline-accept",
): SetupCliOptions | BaselineAcceptCliOptions {
  let target = ".";
  let targetSeen = false;
  let force = false;
  let reason: string | null = null;
  let owner: string | null = null;
  let expiresAt: string | null = null;
  let actionSha: string | null = null;
  let output: string | null = null;
  let fromV2: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] ?? "";
    if (argument === "--force") {
      force = true;
      continue;
    }
    const optionName = argument.includes("=")
      ? argument.slice(0, argument.indexOf("="))
      : argument;
    if (
      optionName === "--reason" ||
      optionName === "--owner" ||
      optionName === "--expires" ||
      optionName === "--action-sha" ||
      optionName === "--output" ||
      optionName === "--from-v2"
    ) {
      const parsed = optionValue(argument, args, index);
      index += parsed.consumed;
      if (optionName === "--reason") reason = parsed.value;
      if (optionName === "--owner") owner = parsed.value;
      if (optionName === "--expires") expiresAt = parsed.value;
      if (optionName === "--action-sha") actionSha = parsed.value;
      if (optionName === "--output") output = parsed.value;
      if (optionName === "--from-v2") fromV2 = parsed.value;
      continue;
    }
    if (argument.startsWith("-") || targetSeen) {
      throw new RepoLensError(
        "EXECUTION_FAILED",
        `Unknown ${command} argument: ${argument}`,
      );
    }
    target = argument;
    targetSeen = true;
  }
  if (command === "setup") {
    if (output || fromV2) {
      throw new RepoLensError(
        "EXECUTION_FAILED",
        "setup does not accept --output or --from-v2.",
      );
    }
    return {
      command,
      target,
      force,
      reason,
      owner,
      expiresAt,
      actionSha,
    };
  }
  if (actionSha) {
    throw new RepoLensError(
      "EXECUTION_FAILED",
      "baseline accept does not accept --action-sha.",
    );
  }
  return {
    command,
    target,
    output,
    reason,
    owner,
    expiresAt,
    fromV2,
    force,
  };
}

function parseScan(
  command: "scan" | "compare",
  args: string[],
): ScanCliOptions {
  let target = ".";
  let targetSeen = false;
  let formats: ReportFormat[] = ["terminal"];
  let output: string | null = null;
  let configPath: string | null = null;
  let baselinePath: string | null = null;
  let failOn: ScanCliOptions["failOn"] = null;
  let strict: boolean | null = null;
  let offline = false;
  let tokenEnv = "GITHUB_TOKEN";
  let noColor = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] ?? "";
    if (argument === "--offline") {
      offline = true;
      continue;
    }
    if (argument === "--strict" || argument === "--no-strict") {
      strict = argument === "--strict";
      continue;
    }
    if (argument === "--no-color") {
      noColor = true;
      continue;
    }
    if (argument === "--token" || argument.startsWith("--token=")) {
      throw new RepoLensError(
        "EXECUTION_FAILED",
        "Raw tokens are not accepted. Use --token-env.",
      );
    }
    const optionName = argument.includes("=")
      ? argument.slice(0, argument.indexOf("="))
      : argument;
    if (
      [
        "-f",
        "--format",
        "-o",
        "--output",
        "--config",
        "--baseline",
        "--fail-on",
        "--token-env",
      ].includes(optionName)
    ) {
      const parsed = optionValue(argument, args, index);
      index += parsed.consumed;
      if (optionName === "-f" || optionName === "--format") {
        formats = parseFormats(parsed.value);
      } else if (optionName === "-o" || optionName === "--output") {
        output = parsed.value;
      } else if (optionName === "--config") {
        configPath = parsed.value;
      } else if (optionName === "--baseline") {
        baselinePath = parsed.value;
      } else if (optionName === "--fail-on") {
        failOn = parseFailOn(parsed.value, "--fail-on");
      } else if (optionName === "--token-env") {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(parsed.value)) {
          throw new RepoLensError(
            "EXECUTION_FAILED",
            "--token-env must be an environment variable name.",
          );
        }
        tokenEnv = parsed.value;
      }
      continue;
    }
    if (argument.startsWith("-") || targetSeen) {
      throw new RepoLensError(
        "EXECUTION_FAILED",
        `Unknown scan argument: ${argument}`,
      );
    }
    target = argument;
    targetSeen = true;
  }
  if (command === "compare" && !baselinePath) {
    throw new RepoLensError(
      "BASELINE_INVALID",
      "compare requires --baseline <baseline.json>.",
    );
  }
  return {
    command,
    target,
    formats,
    output,
    configPath,
    baselinePath,
    failOn,
    strict,
    offline,
    tokenEnv,
    noColor,
  };
}

function parseBaselineCheck(args: string[]): BaselineCheckCliOptions {
  const scan = parseScan("scan", args);
  if (
    scan.formats.length !== 1 ||
    scan.formats[0] !== "terminal" ||
    scan.output ||
    scan.failOn ||
    scan.tokenEnv !== "GITHUB_TOKEN" ||
    scan.noColor
  ) {
    throw new RepoLensError(
      "EXECUTION_FAILED",
      "baseline check accepts target, --baseline, --config, --strict, and --offline.",
    );
  }
  return {
    command: "baseline-check",
    target: scan.target,
    baselinePath: scan.baselinePath,
    configPath: scan.configPath,
    strict: scan.strict,
    offline: scan.offline,
  };
}

export function parseCliArgs(
  args: string[],
): CliOptions | "help" | "version" {
  if (args.length === 0) return parseScan("scan", []);
  if (args.includes("-h") || args.includes("--help")) return "help";
  if (args.includes("-v") || args.includes("--version")) return "version";
  const [first, second, ...rest] = args;
  if (first === "setup") return parseAcceptanceArgs([second, ...rest].filter((item): item is string => item !== undefined), "setup");
  if (first === "init") return parseInit([second, ...rest].filter((item): item is string => item !== undefined));
  if (first === "doctor") {
    const target = second ?? ".";
    if (rest.length > 0 || target.startsWith("-")) {
      throw new RepoLensError("EXECUTION_FAILED", "doctor accepts one target.");
    }
    return { command: "doctor", target } satisfies DoctorCliOptions;
  }
  if (first === "explain") {
    if (!second || rest.length > 0) {
      throw new RepoLensError(
        "EXECUTION_FAILED",
        "explain requires one rule ID.",
      );
    }
    return { command: "explain", ruleId: second } satisfies ExplainCliOptions;
  }
  if (first === "baseline") {
    if (second === "accept") {
      return parseAcceptanceArgs(rest, "baseline-accept");
    }
    if (second === "check") return parseBaselineCheck(rest);
    throw new RepoLensError(
      "EXECUTION_FAILED",
      "baseline requires accept or check.",
    );
  }
  if (first === "scan" || first === "compare") {
    return parseScan(first, [second, ...rest].filter((item): item is string => item !== undefined));
  }
  return parseScan("scan", args);
}

async function pathIsDirectory(path: string): Promise<boolean> {
  return (await stat(path).catch(() => null))?.isDirectory() === true;
}

export async function emitReports(
  options: ScanCliOptions,
  report: Awaited<ReturnType<typeof runAudit>>["report"],
): Promise<void> {
  const sarifRoot = (await pathIsDirectory(options.target))
    ? resolve(options.target)
    : null;
  const renderers: Record<ReportFormat, () => string> = {
    terminal: () =>
      renderTerminal(report, {
        color:
          !options.noColor &&
          process.stdout.isTTY === true &&
          !("NO_COLOR" in process.env),
      }),
    json: () => renderJson(report),
    html: () => renderHtml(report),
    github: () => renderGitHubMarkdown(report),
    sarif: () => renderSarif(report, sarifRoot),
  };
  const extensions: Record<ReportFormat, string> = {
    terminal: "txt",
    json: "json",
    html: "html",
    github: "md",
    sarif: "sarif",
  };
  if (!options.output && options.formats.length === 1) {
    const format = options.formats[0] ?? "terminal";
    process.stdout.write(renderers[format]());
    return;
  }
  if (!options.output) {
    for (const format of options.formats) {
      if (format === "terminal") process.stdout.write(renderers[format]());
      else {
        const path = resolve(`repolens-report.${extensions[format]}`);
        await writeFile(path, renderers[format](), "utf8");
        process.stderr.write(`RepoLens wrote ${path}\n`);
      }
    }
    return;
  }
  if (options.formats.length === 1) {
    const format = options.formats[0] ?? "terminal";
    const destination =
      (await pathIsDirectory(options.output)) ||
      (extname(options.output) === "" && options.output.endsWith("/"))
        ? join(options.output, `repolens-report.${extensions[format]}`)
        : options.output;
    await mkdir(dirname(resolve(destination)), { recursive: true });
    await writeFile(resolve(destination), renderers[format](), "utf8");
    process.stderr.write(`RepoLens wrote ${resolve(destination)}\n`);
    return;
  }
  await mkdir(resolve(options.output), { recursive: true });
  for (const format of options.formats) {
    const destination = join(
      resolve(options.output),
      `repolens-report.${extensions[format]}`,
    );
    await writeFile(destination, renderers[format](), "utf8");
    process.stderr.write(`RepoLens wrote ${destination}\n`);
  }
}

async function runScan(options: ScanCliOptions): Promise<number> {
  const result = await runAudit({
    target: options.target,
    configPath: options.configPath,
    baselinePath: options.baselinePath,
    failOn: options.failOn,
    strict: options.strict,
    offline: options.offline,
    githubToken: process.env[options.tokenEnv] || null,
  });
  await emitReports(options, result.report);
  return result.exitCode;
}

async function runBaselineCheck(
  options: BaselineCheckCliOptions,
): Promise<number> {
  const result = await runAudit({
    target: options.target,
    configPath: options.configPath,
    baselinePath: options.baselinePath ?? DEFAULT_BASELINE_PATH,
    failOn: "new-warning",
    strict: options.strict,
    offline: options.offline,
    githubToken: process.env.GITHUB_TOKEN || null,
  });
  process.stdout.write(
    renderTerminal(result.report, {
      color: process.stdout.isTTY === true && !("NO_COLOR" in process.env),
    }),
  );
  return result.exitCode;
}

async function runDoctor(options: DoctorCliOptions): Promise<number> {
  const target = resolve(options.target);
  const configPath = await resolveConfigPath(target, null);
  const checks: string[] = [];
  const { config, source } = await loadConfig(configPath.path, true);
  checks.push(`config: ${source} · schema ${config.schema}`);
  const baselinePath = join(target, DEFAULT_BASELINE_PATH);
  const loaded = await loadAcceptedBaseline(baselinePath);
  await validateBaselineCommit(target, loaded.baseline);
  checks.push(
    `baseline: ${baselinePath} · ${loaded.baseline.accepted.length} accepted · expires ${loaded.baseline.acceptance.expiresAt}`,
  );
  checks.push("scope: Node + GitHub");
  process.stdout.write(
    `RepoLens doctor\n${checks.map((item) => `OK  ${item}`).join("\n")}\n`,
  );
  return 0;
}

function runExplain(options: ExplainCliOptions): number {
  const rule = RULES.get(options.ruleId);
  if (!rule) {
    throw new RepoLensError(
      "EXECUTION_FAILED",
      `Unknown rule ID ${options.ruleId}. Known rules:\n${[...RULES.keys()].sort().join("\n")}`,
    );
  }
  process.stdout.write(
    `${rule.id}\n${rule.title}\n\n${rule.explanation}\n\nFix\n${rule.remediation}\n`,
  );
  return 0;
}

export async function runCli(args: string[]): Promise<number> {
  const parsed = parseCliArgs(args);
  if (parsed === "help") {
    process.stdout.write(HELP);
    return 0;
  }
  if (parsed === "version") {
    process.stdout.write(`${TOOL_VERSION}\n`);
    return 0;
  }
  if (parsed.command === "init") {
    const destination = await writeDefaultConfig(
      parsed.target,
      parsed.force,
    );
    process.stdout.write(`RepoLens wrote ${destination}\n`);
    return 0;
  }
  if (parsed.command === "setup") {
    const result = await setupRepository({
      ...parsed,
      githubToken: process.env.GITHUB_TOKEN || null,
    });
    process.stdout.write(
      `RepoLens setup complete\n${result.config}\n${result.baseline}\n${result.workflow}\nAction ${result.actionSha}\n`,
    );
    return 0;
  }
  if (parsed.command === "baseline-accept") {
    const destination = await acceptCurrentBaseline(parsed);
    process.stdout.write(`RepoLens wrote ${destination}\n`);
    return 0;
  }
  if (parsed.command === "baseline-check") {
    return runBaselineCheck(parsed);
  }
  if (parsed.command === "doctor") return runDoctor(parsed);
  if (parsed.command === "explain") return runExplain(parsed);
  return runScan(parsed);
}

function runningAsEntrypoint(): boolean {
  const argument = process.argv[1];
  if (!argument) return false;
  try {
    return (
      realpathSync(argument) ===
      realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
}

if (runningAsEntrypoint()) {
  runCli(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      const failure = asRepoLensError(error);
      process.stderr.write(
        `RepoLens [${failure.code}] ${failure.message}\nRun "repolens --help" for usage.\n`,
      );
      process.exitCode = 2;
    });
}
