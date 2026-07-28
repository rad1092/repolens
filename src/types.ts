export type Severity = "pass" | "info" | "warning" | "critical";

export type CheckId =
  | "readme"
  | "license"
  | "ci"
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
  | "default-branch";

export interface Evidence {
  label: string;
  value: string | number | boolean | null;
}

export interface Finding {
  id: CheckId;
  title: string;
  severity: Severity;
  summary: string;
  action: string | null;
  deduction: number;
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
  latestCommit: CommitInfo | null;
  defaultBranch: string | null;
  latestRelease: ReleaseInfo | null;
  openIssues: number | null;
  openPullRequests: number | null;
  outdatedDependencies: OutdatedDependency[];
  dependencyCheck: {
    attempted: boolean;
    checked: number;
    skippedReason: string | null;
  };
}

export interface AuditOptions {
  now: Date;
  staleDays: number;
  largeFileBytes: number;
  maxTodoMatches: number;
  offline: boolean;
  githubToken: string | null;
  signal?: AbortSignal;
}

export interface AuditReport {
  schemaVersion: 1;
  tool: {
    name: "RepoLens";
    version: string;
  };
  generatedAt: string;
  repository: Omit<RepositoryIdentity, "localPath">;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  counts: {
    pass: number;
    info: number;
    warning: number;
    critical: number;
  };
  findings: Finding[];
  actions: Array<{
    priority: number;
    check: CheckId;
    action: string;
    reason: string;
  }>;
  limitations: string[];
}

export interface CliOptions {
  target: string;
  formats: Array<"terminal" | "json" | "html">;
  output: string | null;
  offline: boolean;
  staleDays: number;
  largeFileBytes: number;
  maxTodoMatches: number;
  tokenEnv: string;
  noColor: boolean;
}
