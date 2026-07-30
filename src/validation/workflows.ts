import { createRuleFinding } from "../rules.js";
import type { Finding, Inventory } from "../types.js";
import type { ConfiguredCheck } from "./evidence.js";
import {
  REQUIRED_NODE_SCRIPTS,
  type NodeContract,
} from "./node.js";
import {
  isObject,
  lineOf,
  location,
  parseYamlObject,
  readTracked,
  type JsonObject,
} from "./shared.js";
import {
  invokedNpmScripts,
  reachableScripts,
} from "./shell.js";

interface ParsedWorkflow {
  path: string;
  raw: string;
  value: JsonObject;
  pullRequest: boolean;
}

interface WorkflowValidation {
  findings: Finding[];
  configured: ConfiguredCheck[];
}

const REPOSITORY_PERMISSION_VALUES = new Set([
  "read",
  "write",
  "none",
]);

function hasTrigger(value: unknown, name: string): boolean {
  if (typeof value === "string") return value === name;
  if (Array.isArray(value)) return value.includes(name);
  return isObject(value) && Object.hasOwn(value, name);
}

function hasPullRequestTrigger(value: unknown): boolean {
  return hasTrigger(value, "pull_request");
}

function triggerNames(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is string => typeof item === "string",
    );
  }
  return isObject(value) ? Object.keys(value) : [];
}

function permissionProblems(
  value: unknown,
  allowScopedWrite = false,
): string[] {
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
    } else if (permission === "write" && !allowScopedWrite) {
      problems.push(`${scope}: ${permission}`);
    }
  }
  return problems;
}

function workflowPermissionProblems(value: JsonObject): string[] {
  const problems = permissionProblems(value.permissions);
  if (!isObject(value.jobs)) return problems;
  const trustedWriteTriggers = new Set([
    "push",
    "release",
    "schedule",
    "workflow_dispatch",
  ]);
  const triggers = triggerNames(value.on);
  const allowScopedWrite =
    triggers.length > 0 &&
    triggers.every((trigger) => trustedWriteTriggers.has(trigger));
  for (const [jobName, job] of Object.entries(value.jobs)) {
    if (!isObject(job) || job.permissions === undefined) continue;
    for (const problem of permissionProblems(
      job.permissions,
      allowScopedWrite,
    )) {
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

export async function validateWorkflows(
  root: string,
  files: Set<string>,
  inventory: Inventory,
  node: NodeContract,
): Promise<WorkflowValidation> {
  const findings: Finding[] = [];
  const configured: ConfiguredCheck[] = [];
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

  if (node.manifest !== null) {
    const workflowRoots = pullRequestWorkflows.flatMap((workflow) =>
      workflowRuns(workflow.value).flatMap(invokedNpmScripts),
    );
    const reached = reachableScripts(workflowRoots, node.scripts);
    for (const script of REQUIRED_NODE_SCRIPTS) {
      if (!node.scripts[script] || reached.has(script)) continue;
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

  return { findings, configured };
}
