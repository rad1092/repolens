import semver from "semver";

import { applyCheckConfig } from "./config.js";
import { TOOL_NAME, TOOL_VERSION } from "./constants.js";
import { createRuleFinding } from "./rules.js";
import { prepareRepository, scanRepository } from "./scanner.js";
import type {
  AuditOptions,
  AuditReport,
  Finding,
  FindingCounts,
  Inventory,
  RepositoryIdentity,
} from "./types.js";
import {
  validateRepository,
  type RepositoryValidation,
} from "./validators.js";

function dependencyObservations(
  inventory: Inventory,
  validation: RepositoryValidation,
): Finding[] {
  return inventory.outdatedDependencies.map((dependency) => {
    const locked = validation.node.locked.get(dependency.name) ?? null;
    const change =
      locked &&
      semver.valid(locked) &&
      semver.valid(dependency.latest)
        ? semver.diff(locked, dependency.latest)
        : null;
    return createRuleFinding({
      ruleId: "npm/update-available",
      stableIdentity: `${dependency.scope}\0${dependency.name}`,
      summary: `${dependency.name} has a ${change ?? "newer"} release for the configured updater to review.`,
      severity: "info",
      location: {
        path: "package.json",
        line: null,
        column: null,
      },
      evidence: [
        { label: "declared", value: dependency.declared },
        { label: "locked", value: locked },
        { label: "latest", value: dependency.latest },
        { label: "change", value: change },
        {
          label: "range",
          value: semver.satisfies(
            dependency.latest,
            dependency.declared,
          )
            ? "includes latest"
            : "excludes latest",
        },
      ],
    });
  });
}

function coverageFindings(inventory: Inventory): Finding[] {
  return inventory.coverage.unknownReasons.map((reason) =>
    createRuleFinding({
      ruleId: "coverage/npm",
      stableIdentity: reason.replace(/HTTP \d+/g, "HTTP"),
      summary: reason,
      severity: "unknown",
      location: {
        path: ".github",
        line: null,
        column: null,
      },
    }),
  );
}

function findingCounts(findings: Finding[]): FindingCounts {
  return {
    info: findings.filter((item) => item.severity === "info").length,
    warning: findings.filter((item) => item.severity === "warning").length,
    critical: findings.filter((item) => item.severity === "critical").length,
    unknown: findings.filter((item) => item.severity === "unknown").length,
  };
}

export function createAuditReport(
  identity: RepositoryIdentity,
  inventory: Inventory,
  validation: RepositoryValidation,
  options: AuditOptions,
): AuditReport {
  const candidates = [
    ...validation.findings,
    ...dependencyObservations(inventory, validation),
    ...coverageFindings(inventory),
  ];
  const configured = applyCheckConfig(
    candidates,
    options.checks,
    options.now,
  );
  const findings = configured.active.sort(
    (left, right) =>
      (left.ruleId ?? left.id).localeCompare(right.ruleId ?? right.id) ||
      (left.location?.path ?? "").localeCompare(
        right.location?.path ?? "",
      ) ||
      (left.location?.line ?? 0) - (right.location?.line ?? 0),
  );
  const counts = findingCounts(findings);
  const { localPath: _localPath, ...repository } = identity;
  void _localPath;

  return {
    schemaVersion: 3,
    tool: { name: TOOL_NAME, version: TOOL_VERSION },
    generatedAt: options.now.toISOString(),
    repository,
    counts,
    summary: {
      newRegressions: counts.critical + counts.warning + counts.unknown,
      acceptedDebt: 0,
      unknownCoverage: counts.unknown,
      ignored: configured.ignored.length,
    },
    comparison: {
      baseline: null,
      new: {
        critical: counts.critical,
        warning: counts.warning,
        unknown: counts.unknown,
      },
      resolved: { critical: 0, warning: 0, unknown: 0 },
      accepted: { critical: 0, warning: 0, unknown: 0 },
      changes: findings
        .filter(
          (finding) =>
            finding.severity === "critical" ||
            finding.severity === "warning" ||
            finding.severity === "unknown",
        )
        .map((finding) => ({
          check: finding.id,
          ruleId: finding.ruleId ?? finding.id,
          fingerprint: finding.fingerprint ?? "",
          path: finding.location?.path ?? null,
          line: finding.location?.line ?? null,
          title: finding.title,
          from: null,
          to: finding.severity,
          kind: "new" as const,
        })),
    },
    policy: {
      failOn: "none",
      strict: false,
      passed: true,
      operationalError: false,
      reasons: [],
    },
    coverage: inventory.coverage,
    configured: validation.configured.map((item) => ({
      ...item,
      verification: "configured-not-executed" as const,
    })),
    findings,
    ignoredFindings: configured.ignored,
    limitations: [
      "RepoLens v0.3 validates the Node and GitHub maintenance contract. Other ecosystems are outside this release.",
      "Configured scripts are parsed and traced into pull-request workflows but are never executed by RepoLens.",
      "Vulnerability, code, workflow-security, and secret-value analysis belong to dedicated scanners such as CodeQL, actionlint, zizmor, Trivy, or Semgrep.",
      "Registry update observations distinguish declared, locked, latest, and change type; Dependabot or Renovate owns the update proposal.",
    ],
  };
}

export async function auditTarget(
  target: string,
  options: AuditOptions,
): Promise<AuditReport> {
  const prepared = await prepareRepository(target, options.githubToken);
  try {
    return auditPreparedRepository(prepared.identity, options);
  } finally {
    await prepared.cleanup();
  }
}

export async function auditPreparedRepository(
  identity: RepositoryIdentity,
  options: AuditOptions,
): Promise<AuditReport> {
  const inventory = await scanRepository(identity, options);
  const validation = await validateRepository(
    identity.localPath,
    inventory,
  );
  return createAuditReport(identity, inventory, validation, options);
}
