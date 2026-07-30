import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  DEFAULT_CONFIG_FILE,
  DEFAULT_EXCLUDES,
  TOOL_VERSION,
} from "./constants.js";
import { RepoLensError } from "./errors.js";
import { createRuleFinding, RULES } from "./rules.js";
import { parseRfc3339Timestamp } from "./timestamp.js";
import type {
  FailOn,
  Finding,
  RepoLensCheckConfig,
  RepoLensConfig,
  RepoLensIgnoreConfig,
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
  failOn: "new-warning",
  strict: false,
};

export const CONFIG_SCHEMA_URL =
  `https://raw.githubusercontent.com/rad1092/repolens/v${TOOL_VERSION}/.repolens.schema.json`;

export const DEFAULT_CONFIG: RepoLensConfig = {
  schema: 2,
  excludes: [...DEFAULT_EXCLUDES],
  policy: { ...DEFAULT_POLICY },
  checks: {},
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

function validatedExpiration(value: unknown, field: string): string {
  const parsed = parseRfc3339Timestamp(value);
  if (!parsed) {
    throw new Error(`${field} must be a valid RFC 3339 date-time.`);
  }
  return parsed.value;
}

function validatedReason(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length < 8) {
    throw new Error(
      `${field} must explain the exception in at least 8 characters.`,
    );
  }
  return value.trim();
}

function parseIgnore(
  value: unknown,
  ruleId: string,
  index: number,
): RepoLensIgnoreConfig {
  if (!isObject(value)) {
    throw new Error(`checks.${ruleId}.ignore[${index}] must be an object.`);
  }
  assertKnownKeys(
    value,
    new Set(["fingerprint", "reason", "expiresAt"]),
    `checks.${ruleId}.ignore[${index}]`,
  );
  if (
    typeof value.fingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.fingerprint)
  ) {
    throw new Error(
      `checks.${ruleId}.ignore[${index}].fingerprint must be a 64-character lowercase SHA-256 value.`,
    );
  }
  return {
    fingerprint: value.fingerprint,
    reason: validatedReason(
      value.reason,
      `checks.${ruleId}.ignore[${index}].reason`,
    ),
    expiresAt: validatedExpiration(
      value.expiresAt,
      `checks.${ruleId}.ignore[${index}].expiresAt`,
    ),
  };
}

function parseCheck(
  value: unknown,
  ruleId: string,
): RepoLensCheckConfig {
  if (!isObject(value)) {
    throw new Error(`checks.${ruleId} must be an object.`);
  }
  assertKnownKeys(
    value,
    new Set(["enabled", "severity", "reason", "expiresAt", "ignore"]),
    `checks.${ruleId}`,
  );
  const parsed: RepoLensCheckConfig = {};
  if (value.enabled !== undefined) {
    if (typeof value.enabled !== "boolean") {
      throw new Error(`checks.${ruleId}.enabled must be a boolean.`);
    }
    parsed.enabled = value.enabled;
  }
  if (value.severity !== undefined) {
    if (
      value.severity !== "info" &&
      value.severity !== "warning" &&
      value.severity !== "critical"
    ) {
      throw new Error(
        `checks.${ruleId}.severity must be info, warning, or critical.`,
      );
    }
    parsed.severity = value.severity;
  }
  if (value.enabled === false) {
    if (value.severity !== undefined || value.ignore !== undefined) {
      throw new Error(
        `checks.${ruleId}.severity and ignore cannot be combined with enabled false.`,
      );
    }
    parsed.reason = validatedReason(
      value.reason,
      `checks.${ruleId}.reason`,
    );
    parsed.expiresAt = validatedExpiration(
      value.expiresAt,
      `checks.${ruleId}.expiresAt`,
    );
  } else if (
    value.reason !== undefined ||
    value.expiresAt !== undefined
  ) {
    throw new Error(
      `checks.${ruleId}.reason and expiresAt are only valid when enabled is false.`,
    );
  }
  if (value.ignore !== undefined) {
    if (!Array.isArray(value.ignore)) {
      throw new Error(`checks.${ruleId}.ignore must be an array.`);
    }
    parsed.ignore = value.ignore.map((item, index) =>
      parseIgnore(item, ruleId, index),
    );
    const fingerprints = new Set<string>();
    for (const item of parsed.ignore) {
      if (fingerprints.has(item.fingerprint)) {
        throw new Error(
          `checks.${ruleId}.ignore contains duplicate fingerprint ${item.fingerprint}.`,
        );
      }
      fingerprints.add(item.fingerprint);
    }
  }
  return parsed;
}

function parseChecks(value: unknown): Record<string, RepoLensCheckConfig> {
  if (value === undefined) return {};
  if (!isObject(value)) {
    throw new Error("checks must be an object keyed by RepoLens rule ID.");
  }
  const checks: Record<string, RepoLensCheckConfig> = {};
  for (const [ruleId, check] of Object.entries(value)) {
    if (!RULES.has(ruleId)) {
      throw new Error(`checks contains unknown rule ID: ${ruleId}`);
    }
    checks[ruleId] = parseCheck(check, ruleId);
  }
  return checks;
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
  if (value.schema !== 1 && value.schema !== 2) {
    throw new Error("RepoLens config schema must be 1 or 2.");
  }
  if (value.schema === 1 && value.checks !== undefined) {
    throw new Error(
      "checks requires RepoLens config schema 2; schema 1 would ignore rule policy.",
    );
  }
  if (
    value.schema === 1 &&
    (value.staleDays !== undefined || value.largeFileMB !== undefined)
  ) {
    throw new Error(
      "schema 1 staleDays and largeFileMB are no longer evaluated; remove them or migrate to schema 2 rule policy.",
    );
  }
  assertKnownKeys(
    value,
    value.schema === 1
      ? new Set([
          "$schema",
          "schema",
          "excludes",
          "staleDays",
          "largeFileMB",
          "policy",
        ])
      : new Set(["$schema", "schema", "excludes", "policy", "checks"]),
    "RepoLens config",
  );
  if (
    value.$schema !== undefined &&
    (typeof value.$schema !== "string" ||
      !/^https:\/\/\S+$/.test(value.$schema))
  ) {
    throw new Error("$schema must be an HTTPS URL when provided.");
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
    schema: value.schema,
    excludes,
    policy,
    checks: value.schema === 2 ? parseChecks(value.checks) : {},
  };
}

export function applyCheckConfig(
  findings: Finding[],
  checks: RepoLensConfig["checks"],
  now = new Date(),
): { active: Finding[]; ignored: Finding[] } {
  const active: Finding[] = [];
  const ignored: Finding[] = [];
  const expiredRules = new Set<string>();
  for (const [ruleId, check] of Object.entries(checks ?? {})) {
    if (
      check.enabled === false &&
      Date.parse(check.expiresAt ?? "") <= now.getTime()
    ) {
      expiredRules.add(ruleId);
    }
    if (
      check.ignore?.some(
        (item) => Date.parse(item.expiresAt) <= now.getTime(),
      )
    ) {
      expiredRules.add(ruleId);
    }
  }

  for (const finding of findings) {
    const ruleId = finding.ruleId;
    const check = ruleId ? checks?.[ruleId] : undefined;
    const configured =
      check?.severity === undefined
        ? finding
        : { ...finding, severity: check.severity };
    if (!ruleId || !check) {
      active.push(configured);
      continue;
    }

    if (check.enabled === false) {
      const expiresAt = check.expiresAt ?? "";
      if (Date.parse(expiresAt) > now.getTime()) {
        ignored.push({
          ...configured,
          ignored: {
            reason: check.reason ?? "Disabled by configuration.",
            expiresAt,
          },
        });
        continue;
      }
      active.push(configured);
      continue;
    }

    const exception = check.ignore?.find(
      (item) => item.fingerprint === finding.fingerprint,
    );
    if (!exception) {
      active.push(configured);
      continue;
    }
    if (Date.parse(exception.expiresAt) > now.getTime()) {
      ignored.push({
        ...configured,
        ignored: {
          reason: exception.reason,
          expiresAt: exception.expiresAt,
        },
      });
    } else {
      active.push(configured);
    }
  }

  for (const ruleId of expiredRules) {
    active.push(
      createRuleFinding({
        ruleId: "config/ignore-expired",
        stableIdentity: ruleId,
        summary: `The configured exception for ${ruleId} has expired.`,
        location: {
          path: ".repolens.json",
          line: 1,
          column: 1,
        },
        evidence: [{ label: "rule", value: ruleId }],
      }),
    );
  }

  return { active, ignored };
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
      path: resolve(target, requested),
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
    if (required) {
      throw new RepoLensError(
        "CONFIG_INVALID",
        `Config file was not found: ${path}`,
      );
    }
    return {
      config: {
        ...DEFAULT_CONFIG,
        excludes: [...DEFAULT_CONFIG.excludes],
        policy: { ...DEFAULT_CONFIG.policy },
        checks: {},
      },
      source: null,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new RepoLensError(
      "CONFIG_INVALID",
      `Could not parse RepoLens config ${path}: ${detail}`,
    );
  }
  try {
    return { config: parseConfig(parsed), source: path };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new RepoLensError(
      "CONFIG_INVALID",
      `Could not validate RepoLens config ${path}: ${detail}`,
    );
  }
}

export function renderDefaultConfig(): string {
  return `${JSON.stringify(
    { $schema: CONFIG_SCHEMA_URL, ...DEFAULT_CONFIG },
    null,
    2,
  )}\n`;
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
