import { parse as parseYaml } from "yaml";

import { isObject, type JsonObject } from "./shared.js";

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export interface LockfileCandidate {
  manager: PackageManager;
  path: string;
}

/** Root lockfiles RepoLens reads, in the order they are preferred. */
export const LOCKFILES: readonly LockfileCandidate[] = [
  { manager: "npm", path: "package-lock.json" },
  { manager: "npm", path: "npm-shrinkwrap.json" },
  { manager: "pnpm", path: "pnpm-lock.yaml" },
  { manager: "yarn", path: "yarn.lock" },
  { manager: "bun", path: "bun.lock" },
  { manager: "bun", path: "bun.lockb" },
];

export const LOCKFILE_REGENERATE: Record<PackageManager, string> = {
  npm: "npm install --package-lock-only",
  pnpm: "pnpm install --lockfile-only",
  yarn: "yarn install --mode update-lockfile",
  bun: "bun install --lockfile-only",
};

export interface LockMismatch {
  scope: string;
  name: string;
  expected: string;
  actual: string | null;
}

export interface ParsedLockfile {
  /** A parse error, or null when the lockfile was read. */
  error: string | null;
  /** Locked version of each direct dependency. */
  locked: Map<string, string>;
  /** Places where package.json and the lockfile disagree. */
  mismatches: LockMismatch[];
  /** False when the format cannot be read, such as binary bun.lockb. */
  checked: boolean;
}

const SCOPES = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
] as const;

/** The manager named by package.json "packageManager", such as "pnpm@9.1.0". */
export function declaredPackageManager(
  manifest: JsonObject | null,
): PackageManager | null {
  const value = manifest?.packageManager;
  if (typeof value !== "string") return null;
  const name = value.split("@")[0]?.trim();
  return name === "npm" || name === "pnpm" || name === "yarn" || name === "bun"
    ? name
    : null;
}

/**
 * Picks the lockfile to check: the declared manager's lockfile when it has
 * one, otherwise the first tracked lockfile.
 */
export function chooseLockfile(
  files: Set<string>,
  declared: PackageManager | null,
): { expected: LockfileCandidate | null; found: LockfileCandidate | null } {
  const tracked = LOCKFILES.filter((candidate) => files.has(candidate.path));
  if (declared) {
    const own = tracked.find((candidate) => candidate.manager === declared);
    const expected =
      own ?? LOCKFILES.find((candidate) => candidate.manager === declared)!;
    return { expected, found: own ?? null };
  }
  return { expected: tracked[0] ?? null, found: tracked[0] ?? null };
}

function dependencyMap(value: unknown): Map<string, string> {
  const result = new Map<string, string>();
  if (!isObject(value)) return result;
  for (const [name, range] of Object.entries(value)) {
    if (typeof range === "string") result.set(name, range);
  }
  return result;
}

function compareRoot(
  manifest: JsonObject,
  specifier: (scope: string, name: string) => string | undefined,
  lockNames: (scope: string) => Iterable<string>,
): LockMismatch[] {
  const mismatches: LockMismatch[] = [];
  for (const scope of SCOPES) {
    const expected = dependencyMap(manifest[scope]);
    for (const [name, range] of expected) {
      const actual = specifier(scope, name);
      if (actual !== range) {
        mismatches.push({ scope, name, expected: range, actual: actual ?? null });
      }
    }
    for (const name of lockNames(scope)) {
      if (!expected.has(name)) {
        mismatches.push({
          scope,
          name,
          expected: "absent",
          actual: specifier(scope, name) ?? "present",
        });
      }
    }
  }
  return mismatches;
}

function declaredDependencies(manifest: JsonObject): Array<[string, string]> {
  const seen = new Map<string, string>();
  for (const scope of SCOPES) {
    for (const [name, range] of dependencyMap(manifest[scope])) {
      if (!seen.has(name)) seen.set(name, range);
    }
  }
  return [...seen];
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** pnpm-lock.yaml, lockfile versions 5 through 9. */
export function parsePnpmLockfile(
  raw: string,
  manifest: JsonObject,
): ParsedLockfile {
  let doc: unknown;
  try {
    doc = parseYaml(raw) as unknown;
  } catch (error) {
    return failed(errorMessage(error, "Invalid YAML."));
  }
  if (!isObject(doc)) return failed("pnpm-lock.yaml must contain a mapping.");
  // Version 6 and later keep the root project under importers["."].
  const importer =
    isObject(doc.importers) && isObject(doc.importers["."])
      ? doc.importers["."]
      : doc;
  const specifiers = isObject(importer.specifiers) ? importer.specifiers : {};
  const entry = (scope: string, name: string): unknown => {
    const group = importer[scope];
    return isObject(group) ? group[name] : undefined;
  };
  const specifier = (scope: string, name: string): string | undefined => {
    const value = entry(scope, name);
    if (value === undefined) return undefined;
    if (isObject(value)) {
      return typeof value.specifier === "string" ? value.specifier : undefined;
    }
    const legacy = specifiers[name];
    return typeof legacy === "string" ? legacy : undefined;
  };
  const locked = new Map<string, string>();
  for (const scope of SCOPES) {
    const group = importer[scope];
    if (!isObject(group)) continue;
    for (const [name, value] of Object.entries(group)) {
      const version = isObject(value) ? value.version : value;
      if (typeof version === "string") {
        // Peer suffixes look like 18.2.0(react@18.2.0).
        locked.set(name, version.replace(/\(.*$/, ""));
      }
    }
  }
  const mismatches = compareRoot(manifest, specifier, (scope) => {
    const group = importer[scope];
    return isObject(group) ? Object.keys(group) : [];
  });
  return { error: null, locked, mismatches, checked: true };
}

/** yarn.lock from Yarn Classic (v1) or Yarn Berry (2 and later). */
export function parseYarnLockfile(
  raw: string,
  manifest: JsonObject,
): ParsedLockfile {
  const versions = new Map<string, string>();
  let current: string[] = [];
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    if (line.trim() === "" || line.startsWith("#")) continue;
    if (!line.startsWith(" ")) {
      if (!line.endsWith(":")) {
        return failed(`Unexpected line in yarn.lock: ${line.slice(0, 80)}`);
      }
      const header = line.slice(0, -1);
      current =
        header === "__metadata"
          ? []
          : header
              .split(/,\s*/)
              .map((descriptor) => descriptor.trim().replace(/^"|"$/g, ""))
              .filter(Boolean);
      for (const descriptor of current) versions.set(descriptor, "");
      continue;
    }
    const version = /^\s+version:?\s+"?([^"\s]+)"?\s*$/.exec(line);
    if (version && current.length > 0) {
      for (const descriptor of current) versions.set(descriptor, version[1]!);
      current = [];
    }
  }
  if (versions.size === 0 && declaredDependencies(manifest).length > 0) {
    return failed("yarn.lock has no package entries.");
  }

  const locked = new Map<string, string>();
  const mismatches: LockMismatch[] = [];
  for (const [name, range] of declaredDependencies(manifest)) {
    // Workspace, patch, portal and link ranges are keyed by resolved paths.
    if (/^(?:workspace|patch|portal|link|file):/.test(range)) continue;
    const keys = [`${name}@${range}`, `${name}@npm:${range}`];
    const key = keys.find((candidate) => versions.has(candidate));
    if (key === undefined) {
      mismatches.push({
        scope: "packages",
        name: `${name}@${range}`,
        expected: "lockfile entry",
        actual: null,
      });
      continue;
    }
    const version = versions.get(key);
    if (version) locked.set(name, version);
  }
  return { error: null, locked, mismatches, checked: true };
}

/** Removes trailing commas so text bun.lock (JSONC) parses as JSON. */
function stripTrailingCommas(raw: string): string {
  let result = "";
  let inString = false;
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index]!;
    if (inString) {
      result += character;
      if (character === "\\") {
        result += raw[index + 1] ?? "";
        index += 1;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      result += character;
      continue;
    }
    if (character === ",") {
      const rest = raw.slice(index + 1);
      if (/^\s*[}\]]/.test(rest)) continue;
    }
    result += character;
  }
  return result;
}

/** Text bun.lock (Bun 1.2 and later). */
export function parseBunLockfile(
  raw: string,
  manifest: JsonObject,
): ParsedLockfile {
  let doc: unknown;
  try {
    doc = JSON.parse(stripTrailingCommas(raw)) as unknown;
  } catch (error) {
    return failed(errorMessage(error, "Invalid JSON."));
  }
  if (!isObject(doc)) return failed("bun.lock must contain an object.");
  const workspace =
    isObject(doc.workspaces) && isObject(doc.workspaces[""])
      ? doc.workspaces[""]
      : null;
  if (!workspace) {
    return {
      error: null,
      locked: new Map(),
      mismatches: [
        {
          scope: "root",
          name: 'workspaces[""]',
          expected: "root dependency metadata",
          actual: null,
        },
      ],
      checked: true,
    };
  }
  const packages = isObject(doc.packages) ? doc.packages : {};
  const mismatches = compareRoot(
    manifest,
    (scope, name) => {
      const group = workspace[scope];
      return isObject(group) && typeof group[name] === "string"
        ? (group[name] as string)
        : undefined;
    },
    (scope) => {
      const group = workspace[scope];
      return isObject(group) ? Object.keys(group) : [];
    },
  );
  const locked = new Map<string, string>();
  for (const [name] of declaredDependencies(manifest)) {
    const entry = packages[name];
    if (!Array.isArray(entry)) {
      mismatches.push({
        scope: "packages",
        name,
        expected: "installed package entry",
        actual: null,
      });
      continue;
    }
    const resolved = entry[0];
    if (typeof resolved === "string") {
      const at = resolved.lastIndexOf("@");
      if (at > 0) locked.set(name, resolved.slice(at + 1));
    }
  }
  return { error: null, locked, mismatches, checked: true };
}

function failed(error: string): ParsedLockfile {
  return { error, locked: new Map(), mismatches: [], checked: true };
}

export const UNCHECKED_LOCKFILE: ParsedLockfile = {
  error: null,
  locked: new Map(),
  mismatches: [],
  checked: false,
};
