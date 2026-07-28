export type Severity =
  | "pass"
  | "info"
  | "warning"
  | "critical"
  | "unknown";

export type CheckId =
  | "readme"
  | "license"
  | "ci"
  | "action-pinning"
  | "branch-protection"
  | "dependency-updates"
  | "lockfile"
  | "package-scripts"
  | "outdated-dependencies"
  | "todo-fixme"
  | "large-files"
  | "tracked-env"
  | "security-policy"
  | "contributing-guide"
  | "recent-commit"
  | "latest-release"
  | "open-issues"
  | "open-pull-requests"
  | "default-branch"
  | "scan-coverage";

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

export interface FindingComparisonEvidence {
  count: number;
  digest: string | null;
}

export interface Finding {
  id: CheckId;
  title: string;
  severity: Severity;
  summary: string;
  action: string | null;
  deduction: number;
  evidence: Evidence[];
  comparisonEvidence?: FindingComparisonEvidence;
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

export interface CommitInfo {
  sha: string;
  subject: string;
  committedAt: string;
  ageDays: number;
}

export interface ReleaseInfo {
  tag: string;
  name: string;
  publishedAt: string;
  url: string;
}

export interface TodoMatch {
  path: string;
  line: number;
  marker: "TODO" | "FIXME";
  text: string;
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
  todoTextFiles: number;
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
  github: {
    status: "complete" | "partial" | "offline" | "not-applicable";
    available: string[];
    unavailable: string[];
  };
  unknownReasons: string[];
}

export interface Inventory {
  isGitRepository: boolean;
  trackedFiles: string[];
  readmeFiles: string[];
  licenseFiles: string[];
  workflowFiles: string[];
  lockfiles: string[];
  packageJson: {
    path: string;
    scripts: Record<string, string>;
    dependencyCount: number;
  } | null;
  todoMatches: TodoMatch[];
  todoTotal: number;
  largeFiles: Array<{ path: string; bytes: number }>;
  trackedEnvFiles: string[];
  securityFiles: string[];
  contributingFiles: string[];
  dependencyUpdateFiles: string[];
  unpinnedActions: Array<{ path: string; reference: string }>;
  latestCommit: CommitInfo | null;
  defaultBranch: string | null;
  branchProtected: boolean | null;
  dependabotSecurityUpdates: boolean | null;
  latestRelease: ReleaseInfo | null;
  openIssues: number | null;
  openPullRequests: number | null;
  outdatedDependencies: OutdatedDependency[];
  dependencyCheck: {
    attempted: boolean;
    eligible: number;
    checked: number;
    status: ScanCoverage["dependencyPackages"]["status"];
    skippedReason: string | null;
  };
  coverage: ScanCoverage;
}

export interface AuditOptions {
  now: Date;
  staleDays: number;
  largeFileBytes: number;
  maxTodoMatches: number;
  offline: boolean;
  githubToken: string | null;
  excludes?: string[];
  signal?: AbortSignal;
}

export interface FindingCounts {
  pass: number;
  info: number;
  warning: number;
  critical: number;
  unknown: number;
}

export interface ComparisonChange {
  check: CheckId;
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
  schemaVersion: 2;
  tool: {
    name: "RepoLens";
    version: string;
  };
  generatedAt: string;
  repository: Omit<RepositoryIdentity, "localPath">;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  counts: FindingCounts;
  comparison: ReportComparison;
  policy: PolicyResult;
  coverage: ScanCoverage;
  findings: Finding[];
  actions: Array<{
    priority: number;
    check: CheckId;
    action: string;
    reason: string;
  }>;
  limitations: string[];
}

export interface RepoLensPolicyConfig {
  failOn: FailOn;
  strict: boolean;
}

export interface RepoLensConfig {
  schema: 1;
  excludes: string[];
  staleDays: number;
  largeFileMB: number;
  policy: RepoLensPolicyConfig;
}

export type ReportFormat = "terminal" | "json" | "html" | "github";

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
  staleDays: number | null;
  largeFileBytes: number | null;
  maxTodoMatches: number;
  tokenEnv: string;
  noColor: boolean;
}

export interface InitCliOptions {
  command: "init";
  target: string;
  force: boolean;
}

export type CliOptions = ScanCliOptions | InitCliOptions;
