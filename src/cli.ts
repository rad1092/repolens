#!/usr/bin/env node

import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  DEFAULT_LARGE_FILE_BYTES,
  DEFAULT_MAX_TODO_MATCHES,
  DEFAULT_STALE_DAYS,
  TOOL_VERSION,
} from "./constants.js";
import { auditTarget } from "./audit.js";
import { renderHtml, renderJson, renderTerminal } from "./reporters.js";
import type { CliOptions } from "./types.js";

const HELP = `RepoLens ${TOOL_VERSION}
Read-only repository maintenance audits for local and GitHub repositories.

Usage:
  repolens [target] [options]

Targets:
  .                              Local repository (default)
  /path/to/repository            Local repository
  owner/repository               GitHub repository
  https://github.com/owner/repo  GitHub repository URL

Options:
  -f, --format <value>       terminal, json, html, all, or a comma-separated list
  -o, --output <path>       Write one report to a file or multiple reports to a directory
      --offline             Skip GitHub API and npm registry checks
      --token-env <name>    Environment variable containing a GitHub token
                            (default: GITHUB_TOKEN; tokens are never written)
      --stale-days <days>   Warn when the latest commit is older (default: 180)
      --large-file-mb <mb>  Large tracked-file threshold (default: 1)
      --max-todos <count>   Maximum TODO/FIXME evidence rows (default: 50)
      --no-color            Disable ANSI colors
  -h, --help                Show help
  -v, --version             Show version

Examples:
  repolens .
  repolens owner/repo --format all --output reports
  repolens . --format html --output repolens-report.html --offline

Safety:
  Audits do not install dependencies, run repository scripts, or edit the target.
  A token may only be read from an environment variable; --token is not accepted.
`;

function positiveNumber(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${option} requires a positive number.`);
  }
  return parsed;
}

function parseFormats(
  value: string,
): Array<"terminal" | "json" | "html"> {
  const requested = value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const expanded = requested.includes("all")
    ? ["terminal", "json", "html"]
    : requested;
  const allowed = new Set(["terminal", "json", "html"]);
  for (const format of expanded) {
    if (!allowed.has(format)) {
      throw new Error(`Unknown report format: ${format}`);
    }
  }
  if (expanded.length === 0) throw new Error("At least one format is required.");
  return [
    ...new Set(expanded as Array<"terminal" | "json" | "html">),
  ];
}

function optionValue(
  argument: string,
  args: string[],
  index: number,
): { value: string; consumed: number } {
  const equals = argument.indexOf("=");
  if (equals >= 0) {
    return { value: argument.slice(equals + 1), consumed: 0 };
  }
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`${argument} requires a value.`);
  }
  return { value, consumed: 1 };
}

export function parseCliArgs(args: string[]): CliOptions | "help" | "version" {
  let target = ".";
  let targetSeen = false;
  let formats: Array<"terminal" | "json" | "html"> = ["terminal"];
  let output: string | null = null;
  let offline = false;
  let staleDays = DEFAULT_STALE_DAYS;
  let largeFileBytes = DEFAULT_LARGE_FILE_BYTES;
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
    if (argument === "-h" || argument === "--help") return "help";
    if (argument === "-v" || argument === "--version") return "version";
    if (argument === "--offline") {
      offline = true;
      continue;
    }
    if (argument === "--no-color") {
      noColor = true;
      continue;
    }
    if (argument === "--token" || argument.startsWith("--token=")) {
      throw new Error(
        "Raw tokens are not accepted. Put the token in an environment variable and use --token-env.",
      );
    }
    if (
      argument === "-f" ||
      argument === "--format" ||
      argument.startsWith("--format=")
    ) {
      const parsed = optionValue(argument, args, index);
      formats = parseFormats(parsed.value);
      index += parsed.consumed;
      continue;
    }
    if (
      argument === "-o" ||
      argument === "--output" ||
      argument.startsWith("--output=")
    ) {
      const parsed = optionValue(argument, args, index);
      output = parsed.value;
      index += parsed.consumed;
      continue;
    }
    if (
      argument === "--token-env" ||
      argument.startsWith("--token-env=")
    ) {
      const parsed = optionValue(argument, args, index);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(parsed.value)) {
        throw new Error("--token-env must be a valid environment variable name.");
      }
      tokenEnv = parsed.value;
      index += parsed.consumed;
      continue;
    }
    if (
      argument === "--stale-days" ||
      argument.startsWith("--stale-days=")
    ) {
      const parsed = optionValue(argument, args, index);
      staleDays = Math.floor(positiveNumber(parsed.value, "--stale-days"));
      index += parsed.consumed;
      continue;
    }
    if (
      argument === "--large-file-mb" ||
      argument.startsWith("--large-file-mb=")
    ) {
      const parsed = optionValue(argument, args, index);
      largeFileBytes = Math.floor(
        positiveNumber(parsed.value, "--large-file-mb") * 1024 * 1024,
      );
      index += parsed.consumed;
      continue;
    }
    if (
      argument === "--max-todos" ||
      argument.startsWith("--max-todos=")
    ) {
      const parsed = optionValue(argument, args, index);
      maxTodoMatches = Math.floor(
        positiveNumber(parsed.value, "--max-todos"),
      );
      index += parsed.consumed;
      continue;
    }
    if (argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`);
    }
    if (targetSeen) throw new Error("Only one repository target is accepted.");
    target = argument;
    targetSeen = true;
  }

  return {
    target,
    formats,
    output,
    offline,
    staleDays,
    largeFileBytes,
    maxTodoMatches,
    tokenEnv,
    noColor,
  };
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

async function emitReports(
  options: CliOptions,
  report: Awaited<ReturnType<typeof auditTarget>>,
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
  } as const;
  const extensions = {
    terminal: "txt",
    json: "json",
    html: "html",
  } as const;

  if (!options.output) {
    if (options.formats.length === 1) {
      const format = options.formats[0];
      if (!format) return;
      process.stdout.write(renderers[format]());
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

  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  try {
    const token = process.env[parsed.tokenEnv] || null;
    const report = await auditTarget(parsed.target, {
      now: new Date(),
      staleDays: parsed.staleDays,
      largeFileBytes: parsed.largeFileBytes,
      maxTodoMatches: parsed.maxTodoMatches,
      offline: parsed.offline,
      githubToken: token,
      signal: controller.signal,
    });
    await emitReports(parsed, report);
    return 0;
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isEntrypoint) {
  runCli(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`RepoLens: ${message}\nRun "repolens --help" for usage.\n`);
      process.exitCode = 1;
    });
}
