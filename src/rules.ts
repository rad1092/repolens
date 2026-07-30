import { createHash } from "node:crypto";

import type {
  CheckId,
  Evidence,
  Finding,
  FindingLocation,
  FindingSource,
  Severity,
} from "./types.js";

export interface RuleDefinition {
  id: string;
  check: CheckId;
  title: string;
  defaultSeverity: "info" | "warning" | "critical" | "unknown";
  source: FindingSource;
  explanation: string;
  remediation: string;
}

const definitions = [
  {
    id: "workflow/syntax",
    check: "workflow-syntax",
    title: "Workflow syntax",
    defaultSeverity: "critical",
    source: "repository",
    explanation:
      "A GitHub Actions workflow must parse as YAML before it can provide any maintenance evidence.",
    remediation:
      "Fix the reported workflow syntax and validate it with actionlint before merging.",
  },
  {
    id: "workflow/pull-request-trigger",
    check: "workflow-trigger",
    title: "Pull-request verification",
    defaultSeverity: "warning",
    source: "repository",
    explanation:
      "At least one valid workflow must run for pull requests so regressions are checked before merge.",
    remediation:
      "Add a pull_request trigger to the workflow that runs the repository verification commands.",
  },
  {
    id: "workflow/permissions",
    check: "workflow-permissions",
    title: "Workflow token permissions",
    defaultSeverity: "warning",
    source: "repository",
    explanation:
      "Implicit or broad GITHUB_TOKEN permissions make a compromised workflow more damaging. Write scopes are especially unsafe in pull-request and reusable workflow contexts.",
    remediation:
      "Declare read-only top-level permissions. Grant a required write scope only on the specific job in a trusted push, release, schedule, or manual workflow.",
  },
  {
    id: "workflow/action-pin",
    check: "action-pinning",
    title: "Immutable action reference",
    defaultSeverity: "warning",
    source: "repository",
    explanation:
      "A tag or branch can move after review; a full commit SHA keeps the executed action immutable.",
    remediation:
      "Replace the action tag or branch with its verified 40-character commit SHA and keep the release tag in a comment.",
  },
  {
    id: "workflow/script-wiring",
    check: "workflow-script-wiring",
    title: "Verification script wiring",
    defaultSeverity: "warning",
    source: "repository",
    explanation:
      "A package script is only configured for pull-request protection when a PR workflow invokes it, directly or through another npm script.",
    remediation:
      "Invoke the missing test, lint, or build script from a pull-request workflow or from a wired aggregate script.",
  },
  {
    id: "dependabot/syntax",
    check: "dependabot-config",
    title: "Dependabot configuration",
    defaultSeverity: "critical",
    source: "repository",
    explanation:
      "A present but malformed Dependabot file does not schedule dependency updates.",
    remediation:
      "Use Dependabot schema version 2 with a valid updates array and supported schedule values.",
  },
  {
    id: "dependabot/npm-coverage",
    check: "dependabot-coverage",
    title: "npm update coverage",
    defaultSeverity: "warning",
    source: "repository",
    explanation:
      "A Node repository needs an npm ecosystem entry covering its root manifest.",
    remediation:
      "Add an npm entry for directory / with a supported schedule interval.",
  },
  {
    id: "dependabot/actions-coverage",
    check: "dependabot-coverage",
    title: "GitHub Actions update coverage",
    defaultSeverity: "warning",
    source: "repository",
    explanation:
      "Pinned action SHAs still need an updater to propose reviewed replacements.",
    remediation:
      "Add a github-actions entry for directory / with a supported schedule interval.",
  },
  {
    id: "node/package-json",
    check: "package-json",
    title: "Node package manifest",
    defaultSeverity: "critical",
    source: "repository",
    explanation:
      "RepoLens cannot verify a Node maintenance contract when package.json is malformed.",
    remediation: "Repair package.json so it is valid JSON with an object root.",
  },
  {
    id: "node/lockfile-syntax",
    check: "lockfile",
    title: "npm lockfile syntax",
    defaultSeverity: "critical",
    source: "repository",
    explanation:
      "A malformed package-lock.json cannot reproduce the declared dependency graph.",
    remediation:
      "Regenerate package-lock.json with the repository's supported npm version and review the diff.",
  },
  {
    id: "node/lockfile-sync",
    check: "lockfile-sync",
    title: "Manifest and lockfile agreement",
    defaultSeverity: "warning",
    source: "repository",
    explanation:
      "The root dependency declarations in package.json and package-lock.json must agree.",
    remediation:
      "Run npm install --package-lock-only with the supported npm version, then review and commit the lockfile change.",
  },
  {
    id: "node/script-contract",
    check: "script-contract",
    title: "Node verification script",
    defaultSeverity: "warning",
    source: "repository",
    explanation:
      "Node repositories need non-placeholder test, lint, and build entry points before CI can wire them.",
    remediation:
      "Define a real test, lint, or build command; RepoLens checks wiring but never executes repository scripts.",
  },
  {
    id: "repository/tracked-env",
    check: "tracked-env",
    title: "Tracked environment file",
    defaultSeverity: "critical",
    source: "repository",
    explanation:
      "Tracked .env-style files are credential exposure candidates even though RepoLens deliberately does not inspect or print their values.",
    remediation:
      "Review the file with a dedicated secret scanner, rotate exposed credentials, remove secrets from history, and keep a value-free example.",
  },
  {
    id: "npm/update-available",
    check: "outdated-dependencies",
    title: "Dependency update available",
    defaultSeverity: "unknown",
    source: "npm",
    explanation:
      "Registry freshness is an observation for the configured dependency updater, not proof of a vulnerability or safe upgrade.",
    remediation:
      "Review the Dependabot or Renovate proposal, release notes, compatibility, and tests before updating.",
  },
  {
    id: "coverage/npm",
    check: "scan-coverage",
    title: "npm metadata coverage",
    defaultSeverity: "unknown",
    source: "npm",
    explanation:
      "Unavailable npm registry metadata is incomplete update coverage and must not be converted into a passing result.",
    remediation:
      "Retry with registry network access, or use offline mode when update metadata is intentionally outside the run.",
  },
  {
    id: "config/ignore-expired",
    check: "baseline-integrity",
    title: "Expired ignore",
    defaultSeverity: "warning",
    source: "repolens",
    explanation:
      "An ignore is a temporary reviewed exception, not a permanent way to hide a finding.",
    remediation:
      "Fix the finding or renew the ignore with a new reason and expiration after review.",
  },
] as const satisfies readonly RuleDefinition[];

export const RULES = new Map<string, RuleDefinition>(
  definitions.map((definition) => [definition.id, definition]),
);

export function ruleDefinition(ruleId: string): RuleDefinition {
  const definition = RULES.get(ruleId);
  if (!definition) {
    throw new Error(`Unknown RepoLens rule: ${ruleId}`);
  }
  return definition;
}

export function findingFingerprint(
  ruleId: string,
  stableIdentity: string,
): string {
  return createHash("sha256")
    .update(`repolens:v3:${ruleId}\0${stableIdentity}`)
    .digest("hex");
}

export function createRuleFinding(options: {
  ruleId: string;
  stableIdentity: string;
  summary: string;
  location?: FindingLocation | null;
  evidence?: Evidence[];
  severity?: Severity;
}): Finding {
  const definition = ruleDefinition(options.ruleId);
  return {
    id: definition.check,
    ruleId: definition.id,
    fingerprint: findingFingerprint(
      definition.id,
      options.stableIdentity,
    ),
    title: definition.title,
    severity: options.severity ?? definition.defaultSeverity,
    summary: options.summary,
    remediation: definition.remediation,
    source: definition.source,
    location: options.location ?? null,
    ignored: null,
    evidence: options.evidence ?? [],
  };
}
