export type Severity =
  | "info"
  | "warning"
  | "critical"
  | "unknown";

export type CheckId =
  | "action-pinning"
  | "lockfile"
  | "outdated-dependencies"
  | "tracked-env"
  | "scan-coverage"
  | "workflow-syntax"
  | "workflow-trigger"
  | "workflow-permissions"
  | "workflow-script-wiring"
  | "dependabot-config"
  | "dependabot-coverage"
  | "package-json"
  | "lockfile-sync"
  | "script-contract"
  | "baseline-integrity";

export type FailOn =
  | "none"
  | "critical"
  | "warning"
  | "new-critical"
  | "new-warning";

export interface Evidence {
  label: string;
  value: string | number | boolean | null;
}

export type FindingSource =
  | "repository"
  | "github"
  | "npm"
  | "repolens";

export interface FindingLocation {
  path: string;
  line: number | null;
  column: number | null;
}

export interface FindingIgnore {
  reason: string;
  expiresAt: string;
}

export interface Finding {
  id: CheckId;
  ruleId?: string;
  fingerprint?: string;
  title: string;
  severity: Severity;
  summary: string;
  remediation?: string | null;
  source?: FindingSource;
  location?: FindingLocation | null;
  ignored?: FindingIgnore | null;
  evidence: Evidence[];
}

export interface RepositoryIdentity {
  input: string;
  kind: "local" | "github";
  name: string;
  localPath: string;
  github: {
    owner: string;
    repo: string;
    url: string;
  } | null;
}

export interface OutdatedDependency {
  name: string;
  declared: string;
  latest: string;
  scope: "dependencies" | "devDependencies" | "optionalDependencies";
}

export interface ScanCoverage {
  trackedFiles: number;
  includedFiles: number;
  excludedFiles: number;
  excludes: string[];
  dependencyPackages: {
    eligible: number;
    checked: number;
    status:
      | "complete"
      | "partial"
      | "offline"
      | "not-applicable"
      | "unavailable";
  };
  unknownReasons: string[];
}

export interface Inventory {
  trackedFiles: string[];
  workflowFiles: string[];
  trackedEnvFiles: string[];
  outdatedDependencies: OutdatedDependency[];
  coverage: ScanCoverage;
}

export interface AuditOptions {
  now: Date;
  offline: boolean;
  githubToken: string | null;
  excludes?: string[];
  checks?: Record<string, RepoLensCheckConfig>;
  signal?: AbortSignal;
}

export interface FindingCounts {
  info: number;
  warning: number;
  critical: number;
  unknown: number;
}

export interface ComparisonChange {
  check: CheckId;
  ruleId?: string;
  fingerprint?: string;
  path?: string | null;
  line?: number | null;
  title: string;
  from: Severity | null;
  to: Severity | null;
  kind: "new" | "worsened" | "improved" | "resolved";
  detail?: string;
}

export interface ReportComparison {
  baseline: {
    source: string;
    generatedAt: string;
  } | null;
  new: Pick<FindingCounts, "critical" | "warning" | "unknown">;
  resolved: Pick<FindingCounts, "critical" | "warning" | "unknown">;
  accepted?: Pick<FindingCounts, "critical" | "warning" | "unknown">;
  changes: ComparisonChange[];
}

export interface PolicyResult {
  failOn: FailOn;
  strict: boolean;
  passed: boolean;
  operationalError: boolean;
  reasons: string[];
}

export interface AuditReport {
  schemaVersion: 3;
  tool: {
    name: "RepoLens";
    version: string;
  };
  generatedAt: string;
  repository: Omit<RepositoryIdentity, "localPath">;
  counts: FindingCounts;
  summary?: {
    newRegressions: number;
    acceptedDebt: number;
    unknownCoverage: number;
    ignored: number;
  };
  comparison: ReportComparison;
  policy: PolicyResult;
  coverage: ScanCoverage;
  configured?: Array<{
    area: string;
    evidence: string;
    verification: "configured-not-executed";
  }>;
  findings: Finding[];
  ignoredFindings?: Finding[];
  limitations: string[];
}

export interface RepoLensPolicyConfig {
  failOn: FailOn;
  strict: boolean;
}

export interface RepoLensIgnoreConfig {
  fingerprint: string;
  reason: string;
  expiresAt: string;
}

export interface RepoLensCheckConfig {
  enabled?: boolean;
  severity?: "info" | "warning" | "critical";
  reason?: string;
  expiresAt?: string;
  ignore?: RepoLensIgnoreConfig[];
}

export interface RepoLensConfig {
  schema: 1 | 2;
  excludes: string[];
  policy: RepoLensPolicyConfig;
  checks?: Record<string, RepoLensCheckConfig>;
}

export type ReportFormat =
  | "terminal"
  | "json"
  | "html"
  | "github"
  | "sarif";

export interface ScanCliOptions {
  command: "scan" | "compare";
  target: string;
  formats: ReportFormat[];
  output: string | null;
  configPath: string | null;
  baselinePath: string | null;
  failOn: FailOn | null;
  strict: boolean | null;
  offline: boolean;
  tokenEnv: string;
  noColor: boolean;
}

export interface InitCliOptions {
  command: "init";
  target: string;
  force: boolean;
}

export interface SetupCliOptions {
  command: "setup";
  target: string;
  force: boolean;
  reason: string | null;
  owner: string | null;
  expiresAt: string | null;
  actionSha: string | null;
}

export interface BaselineAcceptCliOptions {
  command: "baseline-accept";
  target: string;
  output: string | null;
  reason: string | null;
  owner: string | null;
  expiresAt: string | null;
  fromV2: string | null;
  force: boolean;
}

export interface BaselineCheckCliOptions {
  command: "baseline-check";
  target: string;
  baselinePath: string | null;
  configPath: string | null;
  strict: boolean | null;
  offline: boolean;
}

export interface DoctorCliOptions {
  command: "doctor";
  target: string;
}

export interface ExplainCliOptions {
  command: "explain";
  ruleId: string;
}

export type CliOptions =
  | ScanCliOptions
  | InitCliOptions
  | SetupCliOptions
  | BaselineAcceptCliOptions
  | BaselineCheckCliOptions
  | DoctorCliOptions
  | ExplainCliOptions;
