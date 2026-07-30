import { createRuleFinding } from "../rules.js";
import type { Finding } from "../types.js";
import type { ConfiguredCheck } from "./evidence.js";
import {
  isObject,
  lineOf,
  location,
  readTracked,
  type JsonObject,
} from "./shared.js";
import { isPlaceholderScript } from "./shell.js";

export interface NodeContract {
  manifest: JsonObject | null;
  scripts: Record<string, string>;
  declared: Map<string, { range: string; scope: string }>;
  locked: Map<string, string>;
}

export interface NodeValidation {
  findings: Finding[];
  node: NodeContract;
  configured: ConfiguredCheck[];
}

export const REQUIRED_NODE_SCRIPTS = ["test", "lint", "build"] as const;

function parseManifest(
  path: string,
  raw: string,
): {
  manifest: JsonObject | null;
  scripts: Record<string, string>;
  declared: Map<string, { range: string; scope: string }>;
  errors: string[];
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    return {
      manifest: null,
      scripts: {},
      declared: new Map(),
      errors: [
        error instanceof Error ? error.message : `${path} is not valid JSON.`,
      ],
    };
  }
  if (!isObject(parsed)) {
    return {
      manifest: null,
      scripts: {},
      declared: new Map(),
      errors: [`${path} must contain a JSON object.`],
    };
  }

  const scripts: Record<string, string> = {};
  if (isObject(parsed.scripts)) {
    for (const [name, command] of Object.entries(parsed.scripts)) {
      if (typeof command === "string") scripts[name] = command;
    }
  }

  const declared = new Map<string, { range: string; scope: string }>();
  for (const scope of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
  ] as const) {
    const dependencies = parsed[scope];
    if (!isObject(dependencies)) continue;
    for (const [name, range] of Object.entries(dependencies)) {
      if (typeof range === "string") {
        declared.set(`${scope}\0${name}`, { range, scope });
      }
    }
  }
  return { manifest: parsed, scripts, declared, errors: [] };
}

function parseLockfile(
  raw: string,
): {
  root: JsonObject | null;
  locked: Map<string, string>;
  packageEntries: Set<string>;
  error: string | null;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    return {
      root: null,
      locked: new Map(),
      packageEntries: new Set(),
      error: error instanceof Error ? error.message : "Invalid JSON.",
    };
  }
  if (!isObject(parsed)) {
    return {
      root: null,
      locked: new Map(),
      packageEntries: new Set(),
      error: "package-lock.json must contain a JSON object.",
    };
  }
  const packages = parsed.packages;
  const root = isObject(packages) && isObject(packages[""])
    ? packages[""]
    : null;
  const locked = new Map<string, string>();
  const packageEntries = new Set<string>();
  if (isObject(packages)) {
    for (const [path, entry] of Object.entries(packages)) {
      if (path.startsWith("node_modules/") && isObject(entry)) {
        const name = path.slice("node_modules/".length);
        packageEntries.add(name);
        if (typeof entry.version === "string") {
          locked.set(name, entry.version);
        }
      }
    }
  }
  if (locked.size === 0 && isObject(parsed.dependencies)) {
    for (const [name, entry] of Object.entries(parsed.dependencies)) {
      if (isObject(entry)) {
        packageEntries.add(name);
        if (typeof entry.version === "string") {
          locked.set(name, entry.version);
        }
      }
    }
  }
  return { root, locked, packageEntries, error: null };
}

function dependencyMap(value: unknown): Map<string, string> {
  const result = new Map<string, string>();
  if (!isObject(value)) return result;
  for (const [name, range] of Object.entries(value)) {
    if (typeof range === "string") result.set(name, range);
  }
  return result;
}

function validateLockAgreement(
  manifest: JsonObject,
  lockRoot: JsonObject | null,
  packageEntries: Set<string>,
): Array<{
  scope: string;
  name: string;
  expected: string;
  actual: string | null;
}> {
  if (!lockRoot) {
    return [
      {
        scope: "root",
        name: "packages[\"\"]",
        expected: "root dependency metadata",
        actual: null,
      },
    ];
  }
  const mismatches: Array<{
    scope: string;
    name: string;
    expected: string;
    actual: string | null;
  }> = [];
  for (const scope of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
  ] as const) {
    const expected = dependencyMap(manifest[scope]);
    const actual = dependencyMap(lockRoot[scope]);
    for (const [name, range] of expected) {
      if (actual.get(name) !== range) {
        mismatches.push({
          scope,
          name,
          expected: range,
          actual: actual.get(name) ?? null,
        });
      }
    }
    for (const [name, range] of actual) {
      if (!expected.has(name)) {
        mismatches.push({
          scope,
          name,
          expected: "absent",
          actual: range,
        });
      }
    }
  }
  const checkedPackageEntries = new Set<string>();
  for (const dependency of [
    ...dependencyMap(manifest.dependencies).keys(),
    ...dependencyMap(manifest.devDependencies).keys(),
    ...dependencyMap(manifest.optionalDependencies).keys(),
  ]) {
    if (checkedPackageEntries.has(dependency)) continue;
    checkedPackageEntries.add(dependency);
    if (!packageEntries.has(dependency)) {
      mismatches.push({
        scope: "packages",
        name: `node_modules/${dependency}`,
        expected: "installed package entry",
        actual: null,
      });
    }
  }
  return mismatches;
}

export async function validateNodeProject(
  root: string,
  files: Set<string>,
): Promise<NodeValidation> {
  const findings: Finding[] = [];
  const configured: ConfiguredCheck[] = [];
  const manifestRaw = await readTracked(root, files, "package.json");
  let manifest: JsonObject | null = null;
  let scripts: Record<string, string> = {};
  let declared = new Map<string, { range: string; scope: string }>();
  if (manifestRaw !== null) {
    const parsed = parseManifest("package.json", manifestRaw);
    manifest = parsed.manifest;
    scripts = parsed.scripts;
    declared = parsed.declared;
    if (parsed.errors.length > 0) {
      findings.push(
        createRuleFinding({
          ruleId: "node/package-json",
          stableIdentity: "package.json",
          summary: `package.json could not be parsed: ${parsed.errors[0]}`,
          location: location("package.json"),
        }),
      );
    } else {
      configured.push({
        area: "Node manifest",
        evidence: "package.json parsed",
      });
    }
  }

  const lockRaw = await readTracked(root, files, "package-lock.json");
  let lockRoot: JsonObject | null = null;
  let locked = new Map<string, string>();
  let packageEntries = new Set<string>();
  if (manifest !== null) {
    if (lockRaw === null) {
      findings.push(
        createRuleFinding({
          ruleId: "node/lockfile-syntax",
          stableIdentity: "package-lock.json:missing",
          summary: "package-lock.json is missing for the root Node project.",
          location: location("package.json"),
        }),
      );
    } else {
      const parsedLock = parseLockfile(lockRaw);
      lockRoot = parsedLock.root;
      locked = parsedLock.locked;
      packageEntries = parsedLock.packageEntries;
      if (parsedLock.error) {
        findings.push(
          createRuleFinding({
            ruleId: "node/lockfile-syntax",
            stableIdentity: "package-lock.json:syntax",
            summary: `package-lock.json could not be parsed: ${parsedLock.error}`,
            location: location("package-lock.json"),
          }),
        );
      } else {
        const mismatches = validateLockAgreement(
          manifest,
          lockRoot,
          packageEntries,
        );
        for (const mismatch of mismatches) {
          findings.push(
            createRuleFinding({
              ruleId: "node/lockfile-sync",
              stableIdentity: `${mismatch.scope}\0${mismatch.name}`,
              summary:
                mismatch.actual === null
                  ? mismatch.scope === "packages"
                    ? `${mismatch.name} is missing from package-lock.json packages.`
                    : `${mismatch.scope}.${mismatch.name} is missing from the root lockfile metadata.`
                  : `${mismatch.scope}.${mismatch.name} is ${mismatch.expected} in package.json and ${mismatch.actual} in package-lock.json.`,
              location: location("package-lock.json"),
              evidence: [
                { label: "expected", value: mismatch.expected },
                { label: "actual", value: mismatch.actual },
              ],
            }),
          );
        }
        if (mismatches.length === 0) {
          configured.push({
            area: "npm lockfile",
            evidence:
              "root declarations agree and direct dependency package entries exist",
          });
        }
      }
    }

    for (const script of REQUIRED_NODE_SCRIPTS) {
      const command = scripts[script];
      if (!command || isPlaceholderScript(command)) {
        findings.push(
          createRuleFinding({
            ruleId: "node/script-contract",
            stableIdentity: script,
            summary: !command
              ? `The ${script} script is not defined.`
              : `The ${script} script is a placeholder and cannot provide verification evidence.`,
            location: location(
              "package.json",
              lineOf(manifestRaw ?? "", new RegExp(`"${script}"\\s*:`)),
            ),
            evidence: command ? [{ label: "command", value: command }] : [],
          }),
        );
      } else {
        configured.push({
          area: `npm script: ${script}`,
          evidence: command,
        });
      }
    }
  }

  return {
    findings,
    node: { manifest, scripts, declared, locked },
    configured,
  };
}
