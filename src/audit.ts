import { createHash } from "node:crypto";

import { TOOL_NAME, TOOL_VERSION } from "./constants.js";
import { prepareRepository, scanRepository } from "./scanner.js";
import type {
  AuditOptions,
  AuditReport,
  Evidence,
  Finding,
  FindingComparisonEvidence,
  Inventory,
  RepositoryIdentity,
  Severity,
} from "./types.js";

function evidence(
  entries: Array<[string, string | number | boolean | null]>,
): Evidence[] {
  return entries.map(([label, value]) => ({ label, value }));
}

function comparisonEvidence(
  keys: string[],
  count = keys.length,
  complete = count === keys.length,
): FindingComparisonEvidence {
  if (!complete) return { count, digest: null };

  const hash = createHash("sha256");
  for (const key of [...keys].sort()) {
    hash.update(`${Buffer.byteLength(key, "utf8")}:`);
    hash.update(key);
  }
  return { count, digest: hash.digest("hex") };
}

function finding(
  id: Finding["id"],
  title: string,
  severity: Severity,
  summary: string,
  action: string | null,
  deduction: number,
  details: Evidence[] = [],
  comparisonBasis?: FindingComparisonEvidence,
): Finding {
  const result: Finding = {
    id,
    title,
    severity,
    summary,
    action,
    deduction,
    evidence: details,
  };
  if (comparisonBasis) result.comparisonEvidence = comparisonBasis;
  return result;
}

function documentationFindings(inventory: Inventory): Finding[] {
  return [
    inventory.readmeFiles.length > 0
      ? finding(
          "readme",
          "README",
          "pass",
          "A root README is present.",
          null,
          0,
          evidence([["files", inventory.readmeFiles.join(", ")]]),
        )
      : finding(
          "readme",
          "README",
          "warning",
          "No root README was found.",
          "Add a README with purpose, setup, usage, maintenance status, and support boundaries.",
          10,
        ),
    inventory.licenseFiles.length > 0
      ? finding(
          "license",
          "License",
          "pass",
          "A root license file is present.",
          null,
          0,
          evidence([["files", inventory.licenseFiles.join(", ")]]),
        )
      : finding(
          "license",
          "License",
          "warning",
          "No root LICENSE or COPYING file was found.",
          "Choose an explicit license and add its full text at the repository root.",
          10,
        ),
    inventory.securityFiles.length > 0
      ? finding(
          "security-policy",
          "Security policy",
          "pass",
          "A security policy is present.",
          null,
          0,
          evidence([["files", inventory.securityFiles.join(", ")]]),
        )
      : finding(
          "security-policy",
          "Security policy",
          "warning",
          "No SECURITY document was found.",
          "Add SECURITY.md with supported versions and a private vulnerability reporting path.",
          5,
        ),
    inventory.contributingFiles.length > 0
      ? finding(
          "contributing-guide",
          "Contributing guide",
          "pass",
          "A contribution guide is present.",
          null,
          0,
          evidence([["files", inventory.contributingFiles.join(", ")]]),
        )
      : finding(
          "contributing-guide",
          "Contributing guide",
          "info",
          "No CONTRIBUTING document was found.",
          "Add CONTRIBUTING.md when outside contributions or repeatable maintainer setup matter.",
          0,
        ),
  ];
}

function automationFindings(inventory: Inventory): Finding[] {
  const results: Finding[] = [];
  results.push(
    inventory.workflowFiles.length > 0
      ? finding(
          "ci",
          "CI configuration",
          "pass",
          `${inventory.workflowFiles.length} GitHub Actions workflow file(s) found. File presence does not prove that a run passed.`,
          null,
          0,
          evidence([["files", inventory.workflowFiles.join(", ")]]),
        )
      : finding(
          "ci",
          "CI configuration",
          "warning",
          "No GitHub Actions workflow was found.",
          "Add a pull-request workflow that installs from the lockfile and runs tests, lint, and build.",
          8,
        ),
  );

  results.push(
    inventory.workflowFiles.length === 0
      ? finding(
          "action-pinning",
          "Immutable action references",
          "info",
          "No GitHub Actions workflows were available to inspect.",
          null,
          0,
        )
      : inventory.unpinnedActions.length === 0
        ? finding(
            "action-pinning",
            "Immutable action references",
            "pass",
            "External GitHub Actions references are pinned to full commit SHAs.",
            null,
            0,
          )
        : finding(
            "action-pinning",
            "Immutable action references",
            "warning",
            `${inventory.unpinnedActions.length} external action reference(s) use a mutable tag or branch.`,
            "Pin each external action to a verified full commit SHA and keep a version comment beside it.",
            Math.min(8, inventory.unpinnedActions.length * 2),
            inventory.unpinnedActions.slice(0, 12).map((item) => ({
              label: item.path,
              value: item.reference,
            })),
            comparisonEvidence(
              inventory.unpinnedActions.map((item) => {
                const separator = item.reference.lastIndexOf("@");
                const action =
                  separator > 0
                    ? item.reference.slice(0, separator)
                    : item.reference;
                return `${item.path}\u0000${action.toLowerCase()}`;
              }),
            ),
          ),
  );

  const dependencyProject =
    (inventory.packageJson?.dependencyCount ?? 0) > 0 ||
    inventory.lockfiles.length > 0;
  results.push(
    !dependencyProject
      ? finding(
          "dependency-updates",
          "Dependency update automation",
          "info",
          "No dependency project was detected.",
          null,
          0,
        )
      : inventory.dependencyUpdateFiles.length === 0
        ? finding(
            "dependency-updates",
            "Dependency update automation",
            "warning",
            "No Dependabot or Renovate configuration was found.",
            "Configure one dependency update service with a bounded weekly schedule; do not run overlapping bots.",
            6,
          )
        : inventory.dependabotSecurityUpdates === false
          ? finding(
              "dependency-updates",
              "Dependency update automation",
              "warning",
              "A dependency update configuration exists, but GitHub reports Dependabot security updates disabled.",
              "Enable Dependabot alerts and security updates, or document the alternative security update process.",
              4,
              evidence([
                ["files", inventory.dependencyUpdateFiles.join(", ")],
              ]),
            )
          : finding(
              "dependency-updates",
              "Dependency update automation",
              "pass",
              `Dependency update configuration found: ${inventory.dependencyUpdateFiles.join(", ")}.`,
              null,
              0,
            ),
  );

  results.push(
    inventory.branchProtected === true
      ? finding(
          "branch-protection",
          "Default branch protection",
          "pass",
          "GitHub reports protection for the default branch.",
          null,
          0,
        )
      : inventory.branchProtected === false
        ? finding(
            "branch-protection",
            "Default branch protection",
            "warning",
            "The default branch is not protected by classic branch protection or an active matching ruleset.",
            "Add a repository ruleset or branch protection that blocks force pushes and requires the relevant checks.",
            10,
          )
        : finding(
            "branch-protection",
            "Default branch protection",
            inventory.coverage.github.status === "partial"
              ? "unknown"
              : "info",
            inventory.coverage.github.status === "partial"
              ? "Branch protection could not be verified with the available GitHub permission or API quota."
              : "Branch protection was not checked for this local or offline audit.",
            inventory.coverage.github.status === "partial"
              ? "Run with a token that can read repository rules, or review the setting in GitHub."
              : null,
            0,
          ),
  );

  results.push(
    inventory.lockfiles.length > 0
      ? finding(
          "lockfile",
          "Dependency lockfile",
          "pass",
          `${inventory.lockfiles.length} dependency lockfile(s) found.`,
          null,
          0,
          evidence([["files", inventory.lockfiles.join(", ")]]),
        )
      : dependencyProject
        ? finding(
            "lockfile",
            "Dependency lockfile",
            "warning",
            "Dependencies are declared but no recognized lockfile was found.",
            "Generate and commit the package manager lockfile for reproducible installs.",
            7,
          )
        : finding(
            "lockfile",
            "Dependency lockfile",
            "info",
            "No dependency manifest requiring a lockfile was detected.",
            null,
            0,
          ),
  );

  if (!inventory.packageJson) {
    results.push(
      finding(
        "package-scripts",
        "Package scripts",
        "info",
        "No root package.json was found; npm scripts were not applicable.",
        null,
        0,
      ),
    );
  } else {
    const scripts = Object.keys(inventory.packageJson.scripts);
    const expected = ["test", "build", "lint"];
    const missing = expected.filter((name) => !scripts.includes(name));
    results.push(
      missing.length === 0
        ? finding(
            "package-scripts",
            "Package scripts",
            "pass",
            "Root test, build, and lint scripts are present.",
            null,
            0,
            evidence([["scripts", scripts.sort().join(", ")]]),
          )
        : finding(
            "package-scripts",
            "Package scripts",
            "warning",
            `Root package.json is missing: ${missing.join(", ")}.`,
            `Add working ${missing.join(", ")} script${missing.length === 1 ? "" : "s"} and run them in CI.`,
            Math.min(6, missing.length * 2),
            evidence([["present", scripts.sort().join(", ") || "none"]]),
          ),
    );
  }

  return results;
}

function hygieneFindings(inventory: Inventory): Finding[] {
  const results: Finding[] = [];

  if (
    inventory.dependencyCheck.status === "unavailable" ||
    (inventory.dependencyCheck.status === "partial" &&
      inventory.outdatedDependencies.length === 0)
  ) {
    results.push(
      finding(
        "outdated-dependencies",
        "Outdated npm dependencies",
        "unknown",
        inventory.dependencyCheck.skippedReason ??
          "npm dependency metadata was incomplete.",
        "Retry with registry access before treating dependency freshness as clear.",
        0,
        evidence([
          ["eligible", inventory.dependencyCheck.eligible],
          ["checked", inventory.dependencyCheck.checked],
        ]),
      ),
    );
  } else if (!inventory.dependencyCheck.attempted) {
    results.push(
      finding(
        "outdated-dependencies",
        "Outdated npm dependencies",
        "info",
        inventory.dependencyCheck.skippedReason ??
          "The npm dependency check was not applicable.",
        null,
        0,
      ),
    );
  } else if (inventory.outdatedDependencies.length === 0) {
    results.push(
      finding(
        "outdated-dependencies",
        "Outdated npm dependencies",
        "pass",
        `No out-of-range npm updates were found across ${inventory.dependencyCheck.checked} checked package(s).`,
        null,
        0,
      ),
    );
  } else {
    results.push(
      finding(
        "outdated-dependencies",
        "Outdated npm dependencies",
        "warning",
        `${inventory.outdatedDependencies.length} declared range(s) exclude the latest npm release.`,
        "Review the listed updates individually, run tests, and update the lockfile; do not bulk-upgrade blindly.",
        Math.min(10, inventory.outdatedDependencies.length * 2),
        inventory.outdatedDependencies.slice(0, 15).map((dependency) => ({
          label: dependency.name,
          value: `${dependency.declared} → ${dependency.latest} (${dependency.scope})`,
        })),
        comparisonEvidence(
          inventory.outdatedDependencies.map(
            (dependency) =>
              `${dependency.scope}\u0000${dependency.name.toLowerCase()}`,
          ),
        ),
      ),
    );
  }

  results.push(
    inventory.todoTotal === 0
      ? finding(
          "todo-fixme",
          "TODO and FIXME markers",
          "pass",
          "No TODO or FIXME markers were found in scanned text files.",
          null,
          0,
        )
      : finding(
          "todo-fixme",
          "TODO and FIXME markers",
          inventory.todoTotal > 20 ? "warning" : "info",
          `${inventory.todoTotal} TODO/FIXME marker(s) found.`,
          "Convert actionable markers into tracked issues or resolve them; leave only contextual markers with owners.",
          inventory.todoTotal > 20
            ? Math.min(5, Math.ceil(inventory.todoTotal / 10))
            : 0,
          inventory.todoMatches.slice(0, 12).map((match) => ({
            label: `${match.path}:${match.line}`,
            value: `${match.marker} — ${match.text}`,
          })),
          comparisonEvidence(
            inventory.todoMatches.map(
              (match) =>
                `${match.path}\u0000${match.marker}\u0000${match.text}`,
            ),
            inventory.todoTotal,
          ),
        ),
  );

  results.push(
    inventory.largeFiles.length === 0
      ? finding(
          "large-files",
          "Large tracked files",
          "pass",
          "No tracked file exceeded the configured size threshold.",
          null,
          0,
        )
      : finding(
          "large-files",
          "Large tracked files",
          "warning",
          `${inventory.largeFiles.length} tracked file(s) exceeded the configured size threshold.`,
          "Remove generated artifacts, compress appropriate assets, or use Git LFS for files that belong in version control.",
          Math.min(8, inventory.largeFiles.length * 2),
          inventory.largeFiles.slice(0, 12).map((file) => ({
            label: file.path,
            value: `${(file.bytes / (1024 * 1024)).toFixed(2)} MiB`,
          })),
          comparisonEvidence(
            inventory.largeFiles.map((file) => file.path),
          ),
        ),
  );

  results.push(
    !inventory.isGitRepository
      ? finding(
          "tracked-env",
          "Tracked environment files",
          "info",
          "The target is not a Git work tree, so tracked .env risk is not applicable.",
          "Review environment files before initializing version control and commit only value-free examples.",
          0,
        )
      : inventory.trackedEnvFiles.length === 0
      ? finding(
          "tracked-env",
          "Tracked environment files",
          "pass",
          "No tracked .env file pattern was found.",
          null,
          0,
        )
      : finding(
          "tracked-env",
          "Tracked environment files",
          "critical",
          `${inventory.trackedEnvFiles.length} tracked environment file(s) may expose credentials.`,
          "Remove tracked environment files from history after rotating any exposed credentials; commit a value-free .env.example instead.",
          20,
          inventory.trackedEnvFiles.map((path) => ({
            label: "path",
            value: path,
          })),
          comparisonEvidence(inventory.trackedEnvFiles),
        ),
  );

  return results;
}

function activityFindings(
  inventory: Inventory,
  identity: RepositoryIdentity,
  staleDays: number,
): Finding[] {
  const results: Finding[] = [];

  if (!inventory.latestCommit && !inventory.isGitRepository) {
    results.push(
      finding(
        "recent-commit",
        "Recent commit",
        "info",
        "The target is not a Git work tree, so commit activity is unavailable.",
        "Initialize version control when this directory becomes a maintained repository.",
        0,
      ),
    );
  } else if (!inventory.latestCommit) {
    results.push(
      finding(
        "recent-commit",
        "Recent commit",
        "warning",
        "No Git commit could be read.",
        "Initialize version control or make repository history available to the audit.",
        8,
      ),
    );
  } else if (inventory.latestCommit.ageDays > staleDays) {
    results.push(
      finding(
        "recent-commit",
        "Recent commit",
        "warning",
        `The latest commit is ${inventory.latestCommit.ageDays} days old.`,
        "Confirm whether the project is maintained, archived, or needs a documented maintenance handoff.",
        6,
        evidence([
          ["commit", inventory.latestCommit.sha.slice(0, 12)],
          ["date", inventory.latestCommit.committedAt],
          ["subject", inventory.latestCommit.subject],
        ]),
      ),
    );
  } else {
    results.push(
      finding(
        "recent-commit",
        "Recent commit",
        "pass",
        `The latest commit is ${inventory.latestCommit.ageDays} day(s) old.`,
        null,
        0,
        evidence([
          ["commit", inventory.latestCommit.sha.slice(0, 12)],
          ["date", inventory.latestCommit.committedAt],
          ["subject", inventory.latestCommit.subject],
        ]),
      ),
    );
  }

  results.push(
    inventory.defaultBranch
      ? finding(
          "default-branch",
          "Default branch",
          "pass",
          `Default branch: ${inventory.defaultBranch}.`,
          null,
          0,
          evidence([["branch", inventory.defaultBranch]]),
        )
      : finding(
          "default-branch",
          "Default branch",
          inventory.isGitRepository ? "warning" : "info",
          inventory.isGitRepository
            ? "The default branch could not be determined."
            : "The target is not a Git work tree, so no default branch exists.",
          inventory.isGitRepository
            ? "Configure origin/HEAD or make GitHub repository metadata available."
            : null,
          inventory.isGitRepository ? 3 : 0,
        ),
  );

  if (!identity.github) {
    results.push(
      finding(
        "latest-release",
        "Latest release",
        "info",
        "No GitHub origin was detected, so release metadata was unavailable.",
        null,
        0,
      ),
    );
  } else if (inventory.latestRelease) {
    results.push(
      finding(
        "latest-release",
        "Latest release",
        "pass",
        `Latest release: ${inventory.latestRelease.tag}.`,
        null,
        0,
        evidence([
          ["published", inventory.latestRelease.publishedAt],
          ["url", inventory.latestRelease.url],
        ]),
      ),
    );
  } else {
    const releaseUnavailable =
      inventory.coverage.github.unavailable.includes("latest release");
    results.push(
      finding(
        "latest-release",
        "Latest release",
        releaseUnavailable ? "unknown" : "info",
        releaseUnavailable
          ? "Latest release metadata could not be read."
          : "No published GitHub release was found.",
        releaseUnavailable
          ? "Retry with GitHub API access before deciding that no release exists."
          : "Publish signed or checksummed releases when consumers need stable downloadable artifacts.",
        0,
      ),
    );
  }

  const issuesUnavailable =
    inventory.coverage.github.unavailable.includes("open issues");
  const pullsUnavailable =
    inventory.coverage.github.unavailable.includes("open pull requests");
  results.push(
    finding(
      "open-issues",
      "Open issues",
      issuesUnavailable ? "unknown" : "info",
      inventory.openIssues === null
        ? issuesUnavailable
          ? "Open issue count could not be read."
          : "Open issue count was not checked."
        : `${inventory.openIssues} open issue(s).`,
      null,
      0,
      evidence([["count", inventory.openIssues]]),
    ),
    finding(
      "open-pull-requests",
      "Open pull requests",
      pullsUnavailable ? "unknown" : "info",
      inventory.openPullRequests === null
        ? pullsUnavailable
          ? "Open pull request count could not be read."
          : "Open pull request count was not checked."
        : `${inventory.openPullRequests} open pull request(s).`,
      null,
      0,
      evidence([["count", inventory.openPullRequests]]),
    ),
  );

  return results;
}

function coverageFinding(inventory: Inventory): Finding {
  const details: Evidence[] = [
    {
      label: "files",
      value: `${inventory.coverage.includedFiles} included / ${inventory.coverage.excludedFiles} excluded / ${inventory.coverage.trackedFiles} discovered`,
    },
    {
      label: "TODO text files",
      value: inventory.coverage.todoTextFiles,
    },
    {
      label: "npm metadata",
      value: `${inventory.coverage.dependencyPackages.checked}/${inventory.coverage.dependencyPackages.eligible} (${inventory.coverage.dependencyPackages.status})`,
    },
    {
      label: "GitHub metadata",
      value: inventory.coverage.github.status,
    },
  ];
  if (inventory.coverage.excludes.length > 0) {
    details.push({
      label: "exclude globs",
      value: inventory.coverage.excludes.join(", "),
    });
  }
  for (const reason of inventory.coverage.unknownReasons.slice(0, 8)) {
    details.push({ label: "unknown", value: reason });
  }

  return inventory.coverage.unknownReasons.length > 0
    ? finding(
        "scan-coverage",
        "Detection scope",
        "unknown",
        `${inventory.coverage.unknownReasons.length} external metadata area(s) could not be verified. Unknown does not mean pass.`,
        "Retry with network and the least GitHub permission needed for the missing metadata, or use non-strict mode when the omission is intentional.",
        0,
        details,
        comparisonEvidence(inventory.coverage.unknownReasons),
      )
    : finding(
        "scan-coverage",
        "Detection scope",
        "info",
        `${inventory.coverage.includedFiles} file(s) were included and ${inventory.coverage.excludedFiles} excluded by configuration.`,
        null,
        0,
        details,
      );
}

function grade(score: number): AuditReport["grade"] {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export function createAuditReport(
  identity: RepositoryIdentity,
  inventory: Inventory,
  options: AuditOptions,
): AuditReport {
  const findings = [
    ...documentationFindings(inventory),
    ...automationFindings(inventory),
    ...hygieneFindings(inventory),
    ...activityFindings(inventory, identity, options.staleDays),
    coverageFinding(inventory),
  ];
  const score = Math.max(
    0,
    100 - findings.reduce((sum, item) => sum + item.deduction, 0),
  );
  const severityOrder: Record<Severity, number> = {
    critical: 0,
    warning: 1,
    unknown: 2,
    info: 3,
    pass: 4,
  };
  const actions = findings
    .filter(
      (item): item is Finding & { action: string } => item.action !== null,
    )
    .sort(
      (a, b) =>
        severityOrder[a.severity] - severityOrder[b.severity] ||
        b.deduction - a.deduction ||
        a.title.localeCompare(b.title),
    )
    .map((item, index) => ({
      priority: index + 1,
      check: item.id,
      action: item.action,
      reason: item.summary,
    }));

  const counts = {
    pass: findings.filter((item) => item.severity === "pass").length,
    info: findings.filter((item) => item.severity === "info").length,
    warning: findings.filter((item) => item.severity === "warning").length,
    critical: findings.filter((item) => item.severity === "critical").length,
    unknown: findings.filter((item) => item.severity === "unknown").length,
  };

  const { localPath: _localPath, ...repository } = identity;
  void _localPath;

  return {
    schemaVersion: 2,
    tool: { name: TOOL_NAME, version: TOOL_VERSION },
    generatedAt: options.now.toISOString(),
    repository,
    score,
    grade: grade(score),
    counts,
    comparison: {
      baseline: null,
      new: { critical: 0, warning: 0, unknown: 0 },
      resolved: { critical: 0, warning: 0, unknown: 0 },
      changes: [],
    },
    policy: {
      failOn: "none",
      strict: false,
      passed: true,
      operationalError: false,
      reasons: [],
    },
    coverage: inventory.coverage,
    findings,
    actions,
    limitations: [
      "RepoLens is a maintenance heuristic, not a vulnerability scanner, license opinion, or proof that tests pass.",
      "A configured workflow file is evidence of automation intent, not evidence that its latest run passed.",
      "TODO/FIXME scanning skips common generated directories, lockfiles, minified files, files over 1 MiB, and tracked .env contents.",
      "Tracked environment risk is reported from filenames only; RepoLens does not print environment-file values.",
      inventory.dependencyCheck.attempted
        ? "Outdated dependency checks compare supported root npm ranges with the registry latest tag; they do not resolve compatibility."
        : `Outdated npm dependency check skipped: ${inventory.dependencyCheck.skippedReason ?? "not applicable"}`,
      identity.kind === "github"
        ? "Remote audits use a temporary shallow clone and remove it after reporting."
        : "Local audits do not modify files, install dependencies, or run repository scripts.",
      identity.github
        ? "GitHub settings and counts are point-in-time API results; unavailable fields remain unknown rather than passing."
        : "GitHub release, issue, and pull-request metadata require a recognizable GitHub origin.",
    ],
  };
}

export async function auditTarget(
  target: string,
  options: AuditOptions,
): Promise<AuditReport> {
  const prepared = await prepareRepository(target, options.githubToken);
  try {
    const inventory = await scanRepository(prepared.identity, options);
    return createAuditReport(prepared.identity, inventory, options);
  } finally {
    await prepared.cleanup();
  }
}
