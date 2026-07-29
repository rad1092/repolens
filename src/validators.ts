import { lstat, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import {
  LineCounter,
  isMap,
  parseDocument,
} from "yaml";

import { createRuleFinding } from "./rules.js";
import type {
  Evidence,
  Finding,
  FindingLocation,
  Inventory,
} from "./types.js";

type JsonObject = Record<string, unknown>;

export interface NodeContract {
  manifest: JsonObject | null;
  scripts: Record<string, string>;
  declared: Map<string, { range: string; scope: string }>;
  locked: Map<string, string>;
}

export interface RepositoryValidation {
  findings: Finding[];
  node: NodeContract;
  configured: Array<{
    area: string;
    evidence: string;
  }>;
}

interface ParsedWorkflow {
  path: string;
  raw: string;
  value: JsonObject;
  pullRequest: boolean;
}

const REQUIRED_NODE_SCRIPTS = ["test", "lint", "build"] as const;
const REPOSITORY_PERMISSION_VALUES = new Set(["read", "write", "none"]);
const SAFE_UPDATE_INTERVALS = new Set([
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "semiannually",
  "yearly",
  "cron",
]);

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function location(path: string, line: number | null = 1): FindingLocation {
  return { path, line, column: line === null ? null : 1 };
}

function lineOf(raw: string, pattern: RegExp): number {
  const lines = raw.split(/\r?\n/);
  const index = lines.findIndex((line) => pattern.test(line));
  return index >= 0 ? index + 1 : 1;
}

async function readTracked(
  root: string,
  files: Set<string>,
  path: string,
): Promise<string | null> {
  if (!files.has(path)) return null;
  const absolute = join(root, path);
  const fileStat = await lstat(absolute).catch(() => null);
  if (!fileStat?.isFile() || fileStat.isSymbolicLink()) return null;
  return readFile(absolute, "utf8").catch(() => null);
}

function parseYamlObject(
  path: string,
  raw: string,
): { value: JsonObject | null; errors: string[] } {
  const lineCounter = new LineCounter();
  const document = parseDocument(raw, {
    lineCounter,
    prettyErrors: true,
    strict: true,
    uniqueKeys: true,
  });
  const errors = document.errors.map((error) => error.message);
  if (errors.length > 0 || !isMap(document.contents)) {
    return {
      value: null,
      errors:
        errors.length > 0
          ? errors
          : [`${path} must contain a YAML mapping at its root.`],
    };
  }
  const value = document.toJS({ maxAliasCount: 50 }) as unknown;
  return isObject(value)
    ? { value, errors: [] }
    : {
        value: null,
        errors: [`${path} must contain a YAML mapping at its root.`],
      };
}

function hasPullRequestTrigger(value: unknown): boolean {
  if (typeof value === "string") return value === "pull_request";
  if (Array.isArray(value)) return value.includes("pull_request");
  return isObject(value) && Object.hasOwn(value, "pull_request");
}

function permissionProblems(value: unknown): string[] {
  if (value === undefined) {
    return ["top-level permissions are implicit"];
  }
  if (typeof value === "string") {
    if (value === "read-all") return [];
    if (value === "write-all") return ["permissions is write-all"];
    return [
      `permissions has unsupported value ${JSON.stringify(value)}`,
    ];
  }
  if (!isObject(value)) return ["permissions is not a mapping"];
  const problems: string[] = [];
  for (const [scope, permission] of Object.entries(value)) {
    if (
      typeof permission !== "string" ||
      !REPOSITORY_PERMISSION_VALUES.has(permission)
    ) {
      problems.push(
        `${scope}: unsupported permission ${JSON.stringify(permission)}`,
      );
    } else if (permission === "write") {
      problems.push(`${scope}: ${permission}`);
    }
  }
  return problems;
}

function workflowPermissionProblems(value: JsonObject): string[] {
  const problems = permissionProblems(value.permissions);
  if (!isObject(value.jobs)) return problems;
  for (const [jobName, job] of Object.entries(value.jobs)) {
    if (!isObject(job) || job.permissions === undefined) continue;
    for (const problem of permissionProblems(job.permissions)) {
      problems.push(`${jobName}: ${problem}`);
    }
  }
  return problems;
}

function workflowRuns(value: JsonObject): string[] {
  if (!isObject(value.jobs)) return [];
  const runs: string[] = [];
  for (const job of Object.values(value.jobs)) {
    if (!isObject(job) || !Array.isArray(job.steps)) continue;
    for (const step of job.steps) {
      if (isObject(step) && typeof step.run === "string") {
        runs.push(step.run);
      }
    }
  }
  return runs;
}

function workflowStructureProblems(value: JsonObject): string[] {
  if (!isObject(value.jobs) || Object.keys(value.jobs).length === 0) {
    return ["jobs must be a non-empty mapping"];
  }
  const problems: string[] = [];
  for (const [jobName, job] of Object.entries(value.jobs)) {
    if (!isObject(job)) {
      problems.push(`jobs.${jobName} must be a mapping`);
      continue;
    }
    if (typeof job.uses === "string" && job.uses.trim().length > 0) {
      continue;
    }
    if (job["runs-on"] === undefined) {
      problems.push(`jobs.${jobName}.runs-on is required`);
    }
    if (!Array.isArray(job.steps) || job.steps.length === 0) {
      problems.push(`jobs.${jobName}.steps must be a non-empty array`);
    }
  }
  return problems;
}

function shellCommandSegments(command: string): string[] {
  const segments: string[] = [];
  let segment = "";
  let quote: "'" | '"' | "`" | null = null;
  let escaped = false;
  const push = () => {
    const normalized = segment.trim();
    if (normalized) segments.push(normalized);
    segment = "";
  };

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index] ?? "";
    if (escaped) {
      segment += character;
      escaped = false;
      continue;
    }
    if (quote) {
      segment += character;
      if (character === "\\" && quote !== "'") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "\\") {
      segment += character;
      escaped = true;
      continue;
    }
    if (
      character === "'" ||
      character === '"' ||
      character === "`"
    ) {
      segment += character;
      quote = character;
      continue;
    }
    if (
      character === "#" &&
      (segment.length === 0 || /\s$/.test(segment))
    ) {
      while (
        index + 1 < command.length &&
        command[index + 1] !== "\n"
      ) {
        index += 1;
      }
      push();
      continue;
    }
    const pair = command.slice(index, index + 2);
    if (
      character === "\n" ||
      character === "\r" ||
      character === ";" ||
      pair === "&&" ||
      pair === "||"
    ) {
      push();
      if (pair === "&&" || pair === "||") index += 1;
      continue;
    }
    segment += character;
  }
  push();
  return segments;
}

function invokedNpmScripts(command: string): string[] {
  const scripts: string[] = [];
  const expression =
    /^(?:(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]+))\s+)*(?:(?:command|exec)\s+)?npm\s+(?:--[^\s]+\s+)*(?:(run|run-script)\s+)?([A-Za-z0-9:_-]+)(?:\s|$)/;
  for (const segment of shellCommandSegments(command)) {
    const match = expression.exec(segment);
    if (!match) continue;
    const explicitRun = match[1] !== undefined;
    const script = match[2];
    if (!script) continue;
    if (
      explicitRun ||
      script === "test" ||
      script === "start" ||
      script === "stop" ||
      script === "restart"
    ) {
      scripts.push(script);
    }
  }
  return scripts;
}

function reachableScripts(
  roots: string[],
  scripts: Record<string, string>,
): Set<string> {
  const reached = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const script = queue.shift();
    if (!script || reached.has(script)) continue;
    reached.add(script);
    const command = scripts[script];
    if (!command) continue;
    for (const nested of invokedNpmScripts(command)) {
      if (!reached.has(nested)) queue.push(nested);
    }
  }
  return reached;
}

function isPlaceholderScript(command: string): boolean {
  const normalized = command.trim().replace(/\s+/g, " ");
  if (normalized.length === 0) return true;
  const segments = shellCommandSegments(command);
  return (
    segments.length === 0 ||
    segments.every((segment) =>
      /^(?:echo|printf)\b|^(?:false|true|:|(?:exit|return)\s+\d+)$|^node\s+-e\s+["']?(?:|process\.exit\(0\);?)["']?$/i.test(
        segment,
      ),
    )
  );
}

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
): Array<{ scope: string; name: string; expected: string; actual: string | null }> {
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

function usesEvidence(raw: string): Array<{
  reference: string;
  line: number;
  identity: string;
}> {
  const evidence: Array<{
    reference: string;
    line: number;
    identity: string;
  }> = [];
  const occurrences = new Map<string, number>();
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    const match = /^\s*(?:-\s*)?uses:\s*["']?([^"'#\s]+)["']?/i.exec(line);
    const reference = match?.[1];
    if (
      !reference ||
      reference.startsWith("./") ||
      reference.startsWith("docker://")
    ) {
      continue;
    }
    const separator = reference.lastIndexOf("@");
    const action =
      separator >= 0 ? reference.slice(0, separator) : reference;
    const occurrence = (occurrences.get(action) ?? 0) + 1;
    occurrences.set(action, occurrence);
    const revision = separator >= 0 ? reference.slice(separator + 1) : "";
    if (!/^[a-f0-9]{40}$/i.test(revision)) {
      evidence.push({
        reference,
        line: index + 1,
        identity: `${action}\0${occurrence}`,
      });
    }
  }
  return evidence;
}

function validDependabotEntry(
  entry: unknown,
  ecosystem: "npm" | "github-actions",
): boolean {
  if (!isObject(entry) || entry["package-ecosystem"] !== ecosystem) {
    return false;
  }
  if (dependabotEntryProblems(entry, 0).length > 0) return false;
  const directory = entry.directory;
  const directories = entry.directories;
  const coversRoot =
    directory === "/" ||
    (Array.isArray(directories) && directories.includes("/"));
  if (!coversRoot || !isObject(entry.schedule)) return false;
  return (
    typeof entry.schedule.interval === "string" &&
    SAFE_UPDATE_INTERVALS.has(entry.schedule.interval) &&
    (entry.schedule.interval !== "cron" ||
      (typeof entry.schedule.cronjob === "string" &&
        entry.schedule.cronjob.trim().length > 0))
  );
}

function dependabotEntryProblems(
  entry: unknown,
  index: number,
): string[] {
  const prefix = `updates[${index}]`;
  if (!isObject(entry)) return [`${prefix} must be a mapping`];
  const problems: string[] = [];
  if (
    typeof entry["package-ecosystem"] !== "string" ||
    entry["package-ecosystem"].trim().length === 0
  ) {
    problems.push(`${prefix}.package-ecosystem is required`);
  }
  const definesDirectory = Object.hasOwn(entry, "directory");
  const definesDirectories = Object.hasOwn(entry, "directories");
  const hasDirectory =
    typeof entry.directory === "string" &&
    entry.directory.trim().length > 0;
  const hasDirectories =
    Array.isArray(entry.directories) &&
    entry.directories.length > 0 &&
    entry.directories.every(
      (directory) =>
        typeof directory === "string" && directory.trim().length > 0,
    );
  if (definesDirectory && definesDirectories) {
    problems.push(
      `${prefix}.directory and ${prefix}.directories are mutually exclusive`,
    );
  } else if (!definesDirectory && !definesDirectories) {
    problems.push(
      `${prefix} requires exactly one of directory or directories`,
    );
  } else if (definesDirectory && !hasDirectory) {
    problems.push(`${prefix}.directory must be a non-empty string`);
  } else if (definesDirectories && !hasDirectories) {
    problems.push(
      `${prefix}.directories must be a non-empty array of non-empty strings`,
    );
  }
  if (!isObject(entry.schedule)) {
    problems.push(`${prefix}.schedule must be a mapping`);
  } else if (
    typeof entry.schedule.interval !== "string" ||
    !SAFE_UPDATE_INTERVALS.has(entry.schedule.interval)
  ) {
    problems.push(`${prefix}.schedule.interval is unsupported`);
  } else if (
    entry.schedule.interval === "cron" &&
    (typeof entry.schedule.cronjob !== "string" ||
      entry.schedule.cronjob.trim().length === 0)
  ) {
    problems.push(
      `${prefix}.schedule.cronjob is required for a cron interval`,
    );
  }
  return problems;
}

export async function validateRepository(
  root: string,
  inventory: Inventory,
): Promise<RepositoryValidation> {
  const files = new Set(inventory.trackedFiles);
  const findings: Finding[] = [];
  const configured: Array<{ area: string; evidence: string }> = [];

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

  const parsedWorkflows: ParsedWorkflow[] = [];
  for (const path of inventory.workflowFiles) {
    const raw = await readTracked(root, files, path);
    if (raw === null) continue;
    const parsed = parseYamlObject(path, raw);
    if (!parsed.value) {
      findings.push(
        createRuleFinding({
          ruleId: "workflow/syntax",
          stableIdentity: path,
          summary: `${path} could not be parsed: ${parsed.errors[0]}`,
          location: location(path),
        }),
      );
      continue;
    }
    const structureProblems = workflowStructureProblems(parsed.value);
    if (structureProblems.length > 0) {
      findings.push(
        createRuleFinding({
          ruleId: "workflow/syntax",
          stableIdentity: path,
          summary: `${path} has invalid workflow structure: ${structureProblems.join("; ")}.`,
          location: location(path),
          evidence: structureProblems.map((problem) => ({
            label: "problem",
            value: problem,
          })),
        }),
      );
      continue;
    }
    const pullRequest = hasPullRequestTrigger(parsed.value.on);
    parsedWorkflows.push({ path, raw, value: parsed.value, pullRequest });
    configured.push({ area: "GitHub Actions workflow", evidence: path });

    const permissionIssues = workflowPermissionProblems(parsed.value);
    if (permissionIssues.length > 0) {
      findings.push(
        createRuleFinding({
          ruleId: "workflow/permissions",
          stableIdentity: path,
          summary: `${path} has unsafe or implicit token permissions: ${permissionIssues.join(", ")}.`,
          location: location(
            path,
            lineOf(raw, /^\s*permissions\s*:/),
          ),
          evidence: permissionIssues.map((problem) => ({
            label: "permission",
            value: problem,
          })),
        }),
      );
    }

    for (const item of usesEvidence(raw)) {
      findings.push(
        createRuleFinding({
          ruleId: "workflow/action-pin",
          stableIdentity: `${path}\0${item.identity}`,
          summary: `${item.reference} is not pinned to a full commit SHA.`,
          location: location(path, item.line),
          evidence: [{ label: "reference", value: item.reference }],
        }),
      );
    }
  }

  const pullRequestWorkflows = parsedWorkflows.filter(
    (workflow) => workflow.pullRequest,
  );
  if (inventory.workflowFiles.length === 0 || pullRequestWorkflows.length === 0) {
    findings.push(
      createRuleFinding({
        ruleId: "workflow/pull-request-trigger",
        stableIdentity: "repository",
        summary:
          inventory.workflowFiles.length === 0
            ? "No GitHub Actions workflow is configured."
            : "No valid workflow runs for pull requests.",
        location: location(
          inventory.workflowFiles[0] ?? "package.json",
        ),
      }),
    );
  }

  if (manifest !== null) {
    const workflowRoots = pullRequestWorkflows.flatMap((workflow) =>
      workflowRuns(workflow.value).flatMap(invokedNpmScripts),
    );
    const reached = reachableScripts(workflowRoots, scripts);
    for (const script of REQUIRED_NODE_SCRIPTS) {
      if (!scripts[script] || reached.has(script)) continue;
      findings.push(
        createRuleFinding({
          ruleId: "workflow/script-wiring",
          stableIdentity: script,
          summary: `The ${script} script exists but no pull-request workflow invokes it, directly or through another npm script.`,
          location: location(
            pullRequestWorkflows[0]?.path ??
              inventory.workflowFiles[0] ??
              "package.json",
          ),
          evidence: [{ label: "script", value: script }],
        }),
      );
    }
  }

  const dependabotPath = files.has(".github/dependabot.yml")
    ? ".github/dependabot.yml"
    : files.has(".github/dependabot.yaml")
      ? ".github/dependabot.yaml"
      : null;
  const dependabotRaw = dependabotPath
    ? await readTracked(root, files, dependabotPath)
    : null;
  let dependabotUpdates: unknown[] = [];
  if (dependabotPath && dependabotRaw !== null) {
    const parsed = parseYamlObject(dependabotPath, dependabotRaw);
    if (
      !parsed.value ||
      parsed.value.version !== 2 ||
      !Array.isArray(parsed.value.updates)
    ) {
      findings.push(
        createRuleFinding({
          ruleId: "dependabot/syntax",
          stableIdentity: dependabotPath,
          summary: !parsed.value
            ? `${dependabotPath} could not be parsed: ${parsed.errors[0]}`
            : `${dependabotPath} must use version 2 and contain an updates array.`,
          location: location(dependabotPath),
        }),
      );
    } else {
      dependabotUpdates = parsed.value.updates;
      const entryProblems =
        dependabotUpdates.length === 0
          ? ["updates must contain at least one entry"]
          : dependabotUpdates.flatMap(dependabotEntryProblems);
      if (entryProblems.length > 0) {
        findings.push(
          createRuleFinding({
            ruleId: "dependabot/syntax",
            stableIdentity: dependabotPath,
            summary: `${dependabotPath} has invalid update entries: ${entryProblems.join("; ")}.`,
            location: location(dependabotPath),
            evidence: entryProblems.map((problem) => ({
              label: "problem",
              value: problem,
            })),
          }),
        );
      } else {
        configured.push({
          area: "Dependabot",
          evidence: `${dependabotPath} parsed`,
        });
      }
    }
  } else if (manifest !== null || inventory.workflowFiles.length > 0) {
    findings.push(
      createRuleFinding({
        ruleId: "dependabot/syntax",
        stableIdentity: ".github/dependabot.yml:missing",
        summary: "No Dependabot configuration was found.",
        location: location(".github/dependabot.yml"),
      }),
    );
  }

  if (
    manifest !== null &&
    !dependabotUpdates.some((entry) => validDependabotEntry(entry, "npm"))
  ) {
    findings.push(
      createRuleFinding({
        ruleId: "dependabot/npm-coverage",
        stableIdentity: "root",
        summary:
          "Dependabot does not have a valid npm entry covering the repository root.",
        location: location(dependabotPath ?? ".github/dependabot.yml"),
      }),
    );
  }
  if (
    inventory.workflowFiles.length > 0 &&
    !dependabotUpdates.some((entry) =>
      validDependabotEntry(entry, "github-actions"),
    )
  ) {
    findings.push(
      createRuleFinding({
        ruleId: "dependabot/actions-coverage",
        stableIdentity: "root",
        summary:
          "Dependabot does not have a valid github-actions entry covering the repository root.",
        location: location(dependabotPath ?? ".github/dependabot.yml"),
      }),
    );
  }

  for (const path of inventory.trackedEnvFiles) {
    findings.push(
      createRuleFinding({
        ruleId: "repository/tracked-env",
        stableIdentity: path,
        summary: `${path} is a tracked environment-file risk candidate.`,
        location: location(path, null),
        evidence: [{ label: "path", value: path }],
      }),
    );
  }

  return {
    findings,
    node: { manifest, scripts, declared, locked },
    configured,
  };
}

export function configuredEvidence(
  validation: RepositoryValidation,
): Evidence[] {
  return validation.configured.map((item) => ({
    label: item.area,
    value: item.evidence,
  }));
}
