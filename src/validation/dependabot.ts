import { createRuleFinding } from "../rules.js";
import type { Finding, Inventory } from "../types.js";
import type { ConfiguredCheck } from "./evidence.js";
import {
  isObject,
  location,
  parseYamlObject,
  readTracked,
} from "./shared.js";

interface DependabotValidation {
  findings: Finding[];
  configured: ConfiguredCheck[];
}

const SAFE_UPDATE_INTERVALS = new Set([
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "semiannually",
  "yearly",
  "cron",
]);

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

export async function validateDependabot(
  root: string,
  files: Set<string>,
  inventory: Inventory,
  hasManifest: boolean,
): Promise<DependabotValidation> {
  const findings: Finding[] = [];
  const configured: ConfiguredCheck[] = [];
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
  } else if (hasManifest || inventory.workflowFiles.length > 0) {
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
    hasManifest &&
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

  return { findings, configured };
}
