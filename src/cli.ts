#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseFailOn, writeDefaultConfig } from "./config.js";
import {
  DEFAULT_MAX_TODO_MATCHES,
  TOOL_VERSION,
} from "./constants.js";
import {
  renderGitHubMarkdown,
  renderHtml,
  renderJson,
  renderTerminal,
} from "./reporters.js";
import { runAudit } from "./runner.js";
import type {
  CliOptions,
  InitCliOptions,
  ReportFormat,
  ScanCliOptions,
} from "./types.js";
const HELP = `RepoLens ${TOOL_VERSION}
Read-only maintenance triage for any local or GitHub repository.

Usage:
  repolens scan [target] [options]
  repolens compare [target] --baseline <report.json> [options]
  repolens init [directory] [--force]

Targets:
  .                              Local repository (default)
  /path/to/repository            Local repository
  owner/repository               GitHub repository
  https://github.com/owner/repo  GitHub repository URL

Scan and compare options:
  -f, --format <value>       terminal, json, html, github, all, or a list
  -o, --output <path>       Write one report to a file or reports to a directory
      --config <path>       Read an explicit .repolens.json
      --baseline <path>     Compare with a RepoLens JSON report
      --fail-on <policy>    none, critical, warning, new-critical, new-warning
      --strict              Treat unknown inspection areas as exit 2
      --no-strict           Keep unknown areas visible without exit 2
      --offline             Skip GitHub API and npm registry checks
      --token-env <name>    Environment variable containing a GitHub token
                            (default: GITHUB_TOKEN; tokens are never written)
      --stale-days <days>   Override the configured commit age threshold
      --large-file-mb <mb>  Override the configured tracked-file threshold
      --max-todos <count>   Maximum TODO/FIXME evidence rows (default: 50)
      --no-color            Disable ANSI colors

Init options:
      --force               Replace an existing .repolens.json

Exit codes:
  0  Inspection completed and policy passed
  1  Inspection completed and policy failed
  2  Configuration, network/permission in strict mode, or execution error

Examples:
  repolens init
  repolens scan .
  repolens scan owner/repo --format all --output reports
  repolens compare . --baseline .repolens/baselines/accepted.json --fail-on new-warning

Safety:
  Scans do not install dependencies, run repository scripts, or edit the target.
  init and explicit report output are the only repository-adjacent writes.
`;

function positiveNumber(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${option} requires a positive number.`);
  }
  return parsed;
}

function parseFormats(value: string): ReportFormat[] {
  const requested = value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const expanded = requested.includes("all")
    ? ["terminal", "json", "html", "github"]
    : requested;
  const allowed = new Set(["terminal", "json", "html", "github"]);
  for (const format of expanded) {
    if (!allowed.has(format)) {
      throw new Error(`Unknown report format: ${format}`);
    }
  }
  if (expanded.length === 0) throw new Error("At least one format is required.");
  return [...new Set(expanded as ReportFormat[])];
}

function optionValue(
  argument: string,
  args: string[],
  index: number,
): { value: string; consumed: number } {
  const equals = argument.indexOf("=");
  if (equals >= 0) {
    const value = argument.slice(equals + 1);
    if (!value) throw new Error(`${argument.slice(0, equals)} requires a value.`);
    return { value, consumed: 0 };
  }
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`${argument} requires a value.`);
  }
  return { value, consumed: 1 };
}

function parseInit(args: string[]): InitCliOptions {
  let target = ".";
  let targetSeen = false;
  let force = false;
  for (const argument of args) {
    if (argument === "--force") {
      force = true;
      continue;
    }
    if (argument === "-h" || argument === "--help") {
      throw new Error('Use "repolens --help" for command help.');
    }
    if (argument.startsWith("-")) {
      throw new Error(`Unknown init option: ${argument}`);
    }
    if (targetSeen) throw new Error("init accepts only one directory.");
    target = argument;
    targetSeen = true;
  }
  return { command: "init", target, force };
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
  let staleDays: number | null = null;
  let largeFileBytes: number | null = null;
  let maxTodoMatches = DEFAULT_MAX_TODO_MATCHES;
  let tokenEnv = "GITHUB_TOKEN";
  let noColor = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] ?? "";
    if (argument === "--") {
      const rest = args.slice(index + 1);
      if (rest.length !== 1 || targetSeen) {
        throw new Error("Exactly one target may follow --.");
      }
      target = rest[0] ?? ".";
      targetSeen = true;
      break;
    }
    if (argument === "--offline") {
      offline = true;
      continue;
    }
    if (argument === "--no-color") {
      noColor = true;
      continue;
    }
    if (argument === "--strict") {
      strict = true;
      continue;
    }
    if (argument === "--no-strict") {
      strict = false;
      continue;
    }
    if (argument === "--token" || argument.startsWith("--token=")) {
      throw new Error(
        "Raw tokens are not accepted. Put the token in an environment variable and use --token-env.",
      );
    }

    const valuedOptions = new Set([
      "-f",
      "--format",
      "-o",
      "--output",
      "--config",
      "--baseline",
      "--fail-on",
      "--token-env",
      "--stale-days",
      "--large-file-mb",
      "--max-todos",
    ]);
    const optionName = argument.includes("=")
      ? argument.slice(0, argument.indexOf("="))
      : argument;
    if (valuedOptions.has(optionName)) {
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
          throw new Error("--token-env must be a valid environment variable name.");
        }
        tokenEnv = parsed.value;
      } else if (optionName === "--stale-days") {
        staleDays = Math.floor(positiveNumber(parsed.value, "--stale-days"));
      } else if (optionName === "--large-file-mb") {
        largeFileBytes = Math.floor(
          positiveNumber(parsed.value, "--large-file-mb") * 1024 * 1024,
        );
      } else if (optionName === "--max-todos") {
        maxTodoMatches = Math.floor(
          positiveNumber(parsed.value, "--max-todos"),
        );
      }
      continue;
    }
    if (argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`);
    }
    if (targetSeen) throw new Error("Only one repository target is accepted.");
    target = argument;
    targetSeen = true;
  }

  if (command === "compare" && !baselinePath) {
    throw new Error("compare requires --baseline <report.json>.");
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
    staleDays,
    largeFileBytes,
    maxTodoMatches,
    tokenEnv,
    noColor,
  };
}

export function parseCliArgs(args: string[]): CliOptions | "help" | "version" {
  if (args.includes("-h") || args.includes("--help")) return "help";
  if (args.includes("-v") || args.includes("--version")) return "version";
  const [first, ...rest] = args;
  if (first === "init") return parseInit(rest);
  if (first === "scan" || first === "compare") return parseScan(first, rest);
  return parseScan("scan", args);
}

async function pathIsDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function writeSingleReport(path: string, content: string): Promise<void> {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content, { encoding: "utf8", mode: 0o644 });
  process.stderr.write(`RepoLens wrote ${absolute}\n`);
}

export async function emitReports(
  options: ScanCliOptions,
  report: Awaited<ReturnType<typeof runAudit>>["report"],
): Promise<void> {
  const renderers = {
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
  } as const;
  const extensions = {
    terminal: "txt",
    json: "json",
    html: "html",
    github: "md",
  } as const;

  if (!options.output) {
    if (options.formats.length === 1) {
      const format = options.formats[0];
      if (format) process.stdout.write(renderers[format]());
      return;
    }
    for (const format of options.formats) {
      if (format === "terminal") {
        process.stdout.write(renderers.terminal());
      } else {
        await writeSingleReport(
          `repolens-report.${extensions[format]}`,
          renderers[format](),
        );
      }
    }
    return;
  }

  if (options.formats.length === 1) {
    const format = options.formats[0];
    if (!format) return;
    const outputIsDirectory =
      (await pathIsDirectory(options.output)) ||
      (extname(options.output) === "" && options.output.endsWith("/"));
    const destination = outputIsDirectory
      ? join(options.output, `repolens-report.${extensions[format]}`)
      : options.output;
    await writeSingleReport(destination, renderers[format]());
    return;
  }

  await mkdir(resolve(options.output), { recursive: true });
  for (const format of options.formats) {
    await writeSingleReport(
      join(options.output, `repolens-report.${extensions[format]}`),
      renderers[format](),
    );
  }
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
    const destination = await writeDefaultConfig(parsed.target, parsed.force);
    process.stdout.write(`RepoLens wrote ${destination}\n`);
    return 0;
  }

  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  try {
    const result = await runAudit({
      target: parsed.target,
      configPath: parsed.configPath,
      baselinePath: parsed.baselinePath,
      failOn: parsed.failOn,
      strict: parsed.strict,
      offline: parsed.offline,
      staleDays: parsed.staleDays,
      largeFileBytes: parsed.largeFileBytes,
      maxTodoMatches: parsed.maxTodoMatches,
      githubToken: process.env[parsed.tokenEnv] || null,
      signal: controller.signal,
    });
    await emitReports(parsed, result.report);
    return result.exitCode;
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
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
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(
        `RepoLens: ${message}\nRun "repolens --help" for usage.\n`,
      );
      process.exitCode = 2;
    });
}
