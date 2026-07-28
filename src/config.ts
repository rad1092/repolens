import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  DEFAULT_CONFIG_FILE,
  DEFAULT_EXCLUDES,
  DEFAULT_LARGE_FILE_BYTES,
  DEFAULT_STALE_DAYS,
} from "./constants.js";
import type {
  FailOn,
  RepoLensConfig,
  RepoLensPolicyConfig,
} from "./types.js";

const FAIL_ON_VALUES = new Set<FailOn>([
  "none",
  "critical",
  "warning",
  "new-critical",
  "new-warning",
]);

const DEFAULT_POLICY: RepoLensPolicyConfig = {
  failOn: "critical",
  strict: false,
};

export const DEFAULT_CONFIG: RepoLensConfig = {
  schema: 1,
  excludes: [...DEFAULT_EXCLUDES],
  staleDays: DEFAULT_STALE_DAYS,
  largeFileMB: DEFAULT_LARGE_FILE_BYTES / (1024 * 1024),
  policy: { ...DEFAULT_POLICY },
};

function isObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function assertKnownKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  context: string,
): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new Error(
      `${context} contains unknown field${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`,
    );
  }
}

function positiveNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be a positive number.`);
  }
  return value;
}

export function parseFailOn(value: string, field = "failOn"): FailOn {
  if (!FAIL_ON_VALUES.has(value as FailOn)) {
    throw new Error(
      `${field} must be one of: ${[...FAIL_ON_VALUES].join(", ")}.`,
    );
  }
  return value as FailOn;
}

export function parseConfig(value: unknown): RepoLensConfig {
  if (!isObject(value)) {
    throw new Error("RepoLens config must be a JSON object.");
  }
  assertKnownKeys(
    value,
    new Set(["schema", "excludes", "staleDays", "largeFileMB", "policy"]),
    "RepoLens config",
  );
  if (value.schema !== 1) {
    throw new Error("RepoLens config schema must be 1.");
  }

  let excludes = [...DEFAULT_CONFIG.excludes];
  if (value.excludes !== undefined) {
    if (
      !Array.isArray(value.excludes) ||
      !value.excludes.every(
        (item) =>
          typeof item === "string" &&
          item.length > 0 &&
          item.length <= 300 &&
          !item.includes("\0"),
      )
    ) {
      throw new Error("excludes must be an array of non-empty path globs.");
    }
    excludes = [...new Set(value.excludes)];
  }

  let policy = { ...DEFAULT_POLICY };
  if (value.policy !== undefined) {
    if (!isObject(value.policy)) {
      throw new Error("policy must be a JSON object.");
    }
    assertKnownKeys(
      value.policy,
      new Set(["failOn", "strict"]),
      "policy",
    );
    if (value.policy.failOn !== undefined) {
      if (typeof value.policy.failOn !== "string") {
        throw new Error("policy.failOn must be a string.");
      }
      policy.failOn = parseFailOn(value.policy.failOn, "policy.failOn");
    }
    if (value.policy.strict !== undefined) {
      if (typeof value.policy.strict !== "boolean") {
        throw new Error("policy.strict must be a boolean.");
      }
      policy.strict = value.policy.strict;
    }
  }

  return {
    schema: 1,
    excludes,
    staleDays:
      value.staleDays === undefined
        ? DEFAULT_CONFIG.staleDays
        : Math.floor(positiveNumber(value.staleDays, "staleDays")),
    largeFileMB:
      value.largeFileMB === undefined
        ? DEFAULT_CONFIG.largeFileMB
        : positiveNumber(value.largeFileMB, "largeFileMB"),
    policy,
  };
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

export async function resolveConfigPath(
  target: string,
  requested: string | null,
): Promise<{ path: string; required: boolean }> {
  if (requested) {
    return {
      path: resolve(requested),
      required: true,
    };
  }

  if (await isDirectory(resolve(target))) {
    return {
      path: join(resolve(target), DEFAULT_CONFIG_FILE),
      required: false,
    };
  }

  return {
    path: resolve(DEFAULT_CONFIG_FILE),
    required: false,
  };
}

export async function loadConfig(
  path: string,
  required: boolean,
): Promise<{ config: RepoLensConfig; source: string | null }> {
  if (!(await isFile(path))) {
    if (required) throw new Error(`Config file was not found: ${path}`);
    return {
      config: {
        ...DEFAULT_CONFIG,
        excludes: [...DEFAULT_CONFIG.excludes],
        policy: { ...DEFAULT_CONFIG.policy },
      },
      source: null,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse RepoLens config ${path}: ${detail}`);
  }
  return { config: parseConfig(parsed), source: path };
}

export function renderDefaultConfig(): string {
  return `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`;
}

export async function writeDefaultConfig(
  target: string,
  force: boolean,
): Promise<string> {
  const destination = join(resolve(target), DEFAULT_CONFIG_FILE);
  if (!force && (await isFile(destination))) {
    throw new Error(
      `${destination} already exists. Use --force to replace it.`,
    );
  }
  await writeFile(destination, renderDefaultConfig(), {
    encoding: "utf8",
    mode: 0o644,
    flag: force ? "w" : "wx",
  });
  return destination;
}
