import {
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import { minimatch } from "minimatch";
import semver from "semver";

import {
  IGNORED_DIRECTORIES,
  LOCKFILE_NAMES,
} from "./constants.js";
import { runCommand } from "./process.js";
import type {
  AuditOptions,
  CommitInfo,
  Inventory,
  OutdatedDependency,
  ReleaseInfo,
  RepositoryIdentity,
  TodoMatch,
} from "./types.js";

interface PreparedRepository {
  identity: RepositoryIdentity;
  cleanup: () => Promise<void>;
}

interface GitHubCoordinates {
  owner: string;
  repo: string;
  url: string;
}

interface GitHubRepositoryResponse {
  default_branch?: string;
  security_and_analysis?: {
    dependabot_security_updates?: {
      status?: string;
    };
  };
}

interface GitHubReleaseResponse {
  tag_name?: string;
  name?: string | null;
  published_at?: string | null;
  html_url?: string;
}

interface GitHubSearchResponse {
  total_count?: number;
}

interface GitHubRulesetResponse {
  target?: string;
  enforcement?: string;
  conditions?: {
    ref_name?: {
      include?: string[];
    };
  };
}

interface GitHubMetadata {
  defaultBranch: string | null;
  branchProtected: boolean | null;
  dependabotSecurityUpdates: boolean | null;
  release: ReleaseInfo | null;
  issues: number | null;
  pullRequests: number | null;
  available: string[];
  unavailable: string[];
  unknownReasons: string[];
}

const TEXT_EXTENSIONS = new Set([
  "",
  ".c",
  ".cc",
  ".conf",
  ".cpp",
  ".cs",
  ".css",
  ".csv",
  ".go",
  ".graphql",
  ".h",
  ".hpp",
  ".html",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".kt",
  ".kts",
  ".md",
  ".mjs",
  ".mts",
  ".php",
  ".pl",
  ".properties",
  ".py",
  ".rb",
  ".rs",
  ".rst",
  ".sh",
  ".sql",
  ".svelte",
  ".swift",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".vue",
  ".xml",
  ".yaml",
  ".yml",
  ".zsh",
]);

const SAFE_ENV_EXAMPLES = new Set([
  ".env.example",
  ".env.sample",
  ".env.template",
  ".env.defaults",
]);

function normalizePath(path: string): string {
  return path.split(sep).join("/");
}

function isExcludedPath(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) =>
    minimatch(path, pattern, {
      dot: true,
      matchBase: !pattern.includes("/"),
      nocase: false,
    }),
  );
}

function githubCoordinates(input: string): GitHubCoordinates | null {
  const trimmed = input.trim();
  const ssh = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i.exec(trimmed);
  if (ssh?.[1] && ssh[2]) {
    const owner = ssh[1];
    const repo = ssh[2];
    return { owner, repo, url: `https://github.com/${owner}/${repo}` };
  }

  let pathname = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.hostname.toLowerCase() !== "github.com") return null;
      pathname = parsed.pathname;
    } catch {
      return null;
    }
  } else if (trimmed.startsWith("github.com/")) {
    pathname = trimmed.slice("github.com/".length);
  } else if (!/^[^/\s]+\/[^/\s]+(?:\.git)?$/.test(trimmed)) {
    return null;
  }

  const parts = pathname.replace(/^\/+|\/+$/g, "").split("/");
  if (!parts[0] || !parts[1]) return null;
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, "");
  if (!owner || !repo) return null;
  return { owner, repo, url: `https://github.com/${owner}/${repo}` };
}

async function pathIsDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function localGitHubRemote(root: string): Promise<GitHubCoordinates | null> {
  const topLevel = await runCommand("git", ["rev-parse", "--show-toplevel"], {
    cwd: root,
    allowFailure: true,
  });
  if (!topLevel) return null;
  if (resolve(topLevel.stdout.trim()) !== resolve(root)) {
    const scopedFiles = await runCommand("git", ["ls-files", "-z"], {
      cwd: root,
      allowFailure: true,
    });
    if (!scopedFiles?.stdout) return null;
  }

  const result = await runCommand("git", ["remote", "get-url", "origin"], {
    cwd: root,
    allowFailure: true,
  });
  return result ? githubCoordinates(result.stdout.trim()) : null;
}

export async function prepareRepository(
  target: string,
  githubToken: string | null,
): Promise<PreparedRepository> {
  if (/^https?:\/\//i.test(target)) {
    try {
      const parsedTarget = new URL(target);
      if (parsedTarget.username || parsedTarget.password || parsedTarget.search) {
        throw new Error(
          "Credentials and query parameters in repository URLs are not accepted; use --token-env.",
        );
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("Credentials and query parameters")
      ) {
        throw error;
      }
    }
  }

  const localPath = resolve(target);
  if (await pathIsDirectory(localPath)) {
    const github = await localGitHubRemote(localPath);
    return {
      identity: {
        input: target,
        kind: "local",
        name: basename(localPath),
        localPath,
        github,
      },
      cleanup: async () => {},
    };
  }

  const github = githubCoordinates(target);
  if (!github) {
    throw new Error(
      "Target is neither an existing directory nor a supported GitHub owner/repository or URL.",
    );
  }

  const temporaryRoot = await mkdtemp(join(tmpdir(), "repolens-"));
  const checkoutPath = join(temporaryRoot, "repository");
  const env = { ...process.env };
  delete env.GIT_TRACE;
  delete env.GIT_TRACE_CURL;
  delete env.GIT_TRACE_PACKET;
  delete env.GIT_CURL_VERBOSE;

  if (githubToken) {
    const basicToken = Buffer.from(`x-access-token:${githubToken}`).toString(
      "base64",
    );
    env.GIT_CONFIG_COUNT = "1";
    env.GIT_CONFIG_KEY_0 = "http.extraHeader";
    env.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: basic ${basicToken}`;
    env.GIT_TERMINAL_PROMPT = "0";
  }

  try {
    await runCommand(
      "git",
      [
        "clone",
        "--depth=100",
        "--no-tags",
        "--filter=blob:limit=25m",
        `${github.url}.git`,
        checkoutPath,
      ],
      { env, timeoutMs: 90_000 },
    );
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  } finally {
    delete env.GIT_CONFIG_VALUE_0;
  }

  return {
    identity: {
      input: `${github.owner}/${github.repo}`,
      kind: "github",
      name: github.repo,
      localPath: checkoutPath,
      github,
    },
    cleanup: async () => {
      await rm(temporaryRoot, { recursive: true, force: true });
    },
  };
}

async function walkFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;

      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile()) {
        files.push(normalizePath(relative(root, absolute)));
      }
    }
  }

  await visit(root);
  return files.sort((a, b) => a.localeCompare(b));
}

async function trackedFiles(root: string): Promise<{
  files: string[];
  isGit: boolean;
}> {
  const topLevel = await runCommand("git", ["rev-parse", "--show-toplevel"], {
    cwd: root,
    allowFailure: true,
  });
  if (!topLevel) {
    return { files: await walkFiles(root), isGit: false };
  }

  const result = await runCommand("git", ["ls-files", "-z"], {
    cwd: root,
    allowFailure: true,
  });

  if (!result) {
    return { files: await walkFiles(root), isGit: false };
  }

  const files = result.stdout
    .split("\0")
    .filter(Boolean)
    .map(normalizePath)
    .sort((a, b) => a.localeCompare(b));
  const repositoryRoot = resolve(topLevel.stdout.trim());
  if (files.length === 0 && repositoryRoot !== resolve(root)) {
    return { files: await walkFiles(root), isGit: false };
  }

  return { files, isGit: true };
}

function isReadme(path: string): boolean {
  return /^readme(?:\.[^/]+)?$/i.test(path);
}

function isLicense(path: string): boolean {
  return /^(?:licen[cs]e|copying)(?:\.[^/]+)?$/i.test(path);
}

function isWorkflow(path: string): boolean {
  return /^\.github\/workflows\/[^/]+\.(?:ya?ml)$/i.test(path);
}

function isSecurityFile(path: string): boolean {
  return /^(?:\.github\/)?security(?:\.[^/]+)?$/i.test(path);
}

function isContributingFile(path: string): boolean {
  return /^(?:\.github\/)?contributing(?:\.[^/]+)?$/i.test(path);
}

function isDependencyUpdateFile(path: string): boolean {
  return (
    /^\.github\/dependabot\.ya?ml$/i.test(path) ||
    /^(?:renovate\.json5?|\.renovaterc(?:\.json5?)?)$/i.test(path)
  );
}

function isTrackedEnvRisk(path: string): boolean {
  const name = basename(path).toLowerCase();
  if (SAFE_ENV_EXAMPLES.has(name)) return false;
  return name === ".env" || name.startsWith(".env.");
}

function shouldScanText(path: string): boolean {
  const directorySegments = normalizePath(path).split("/").slice(0, -1);
  if (
    directorySegments.some(
      (segment) =>
        IGNORED_DIRECTORIES.has(segment) ||
        segment === "fixtures" ||
        segment === "__fixtures__" ||
        segment === "testdata",
    )
  ) {
    return false;
  }

  const name = basename(path).toLowerCase();
  if (
    name.endsWith(".min.js") ||
    name.endsWith(".min.css") ||
    name.endsWith(".map") ||
    LOCKFILE_NAMES.has(basename(path))
  ) {
    return false;
  }
  return TEXT_EXTENSIONS.has(extname(name));
}

function isActionMarker(line: string, markerIndex: number, marker: string): boolean {
  const prefix = line.slice(0, markerIndex);
  const suffix = line.slice(markerIndex + marker.length);
  const commentPrefix = /(?:\/\/+|#|\/\*+|\*+|<!--|--)\s*$/.test(prefix);
  const explicitMarker = /^\s*(?::|\(|\[|\{)/.test(suffix);
  return commentPrefix || explicitMarker;
}

async function scanTodos(
  root: string,
  files: string[],
  maxMatches: number,
): Promise<{ matches: TodoMatch[]; total: number; filesScanned: number }> {
  const matches: TodoMatch[] = [];
  let total = 0;
  let filesScanned = 0;

  for (const path of files) {
    if (!shouldScanText(path) || isTrackedEnvRisk(path)) continue;
    const absolute = join(root, path);
    const fileStat = await lstat(absolute).catch(() => null);
    if (
      !fileStat?.isFile() ||
      fileStat.isSymbolicLink() ||
      fileStat.size > 1024 * 1024
    ) {
      continue;
    }

    const content = await readFile(absolute, "utf8").catch(() => null);
    if (content === null || content.includes("\0")) continue;
    filesScanned += 1;

    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      const expression = /\b(TODO|FIXME)\b/gi;
      let match: RegExpExecArray | null;
      while ((match = expression.exec(line)) !== null) {
        if (matches.length < maxMatches) {
          const marker = match[1]?.toUpperCase();
          if (
            (marker === "TODO" || marker === "FIXME") &&
            isActionMarker(line, match.index, marker)
          ) {
            total += 1;
            matches.push({
              path,
              line: index + 1,
              marker,
              text: line.trim().replace(/\s+/g, " ").slice(0, 180),
            });
          }
        } else {
          const marker = match[1]?.toUpperCase();
          if (
            (marker === "TODO" || marker === "FIXME") &&
            isActionMarker(line, match.index, marker)
          ) {
            total += 1;
          }
        }
      }
    }
  }

  return { matches, total, filesScanned };
}

async function unpinnedActions(
  root: string,
  workflowFiles: string[],
): Promise<Array<{ path: string; reference: string }>> {
  const results: Array<{ path: string; reference: string }> = [];
  for (const path of workflowFiles) {
    const content = await readFile(join(root, path), "utf8").catch(() => null);
    if (!content) continue;
    for (const line of content.split(/\r?\n/)) {
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
      const revision = separator >= 0 ? reference.slice(separator + 1) : "";
      if (!/^[a-f0-9]{40}$/i.test(revision)) {
        results.push({ path, reference });
      }
    }
  }
  return results;
}

async function packageInventory(
  root: string,
  files: string[],
): Promise<Inventory["packageJson"]> {
  if (!files.includes("package.json")) return null;

  const packagePath = join(root, "package.json");
  const packageStat = await lstat(packagePath).catch(() => null);
  if (!packageStat?.isFile() || packageStat.isSymbolicLink()) return null;
  const raw = await readFile(packagePath, "utf8").catch(() => null);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as {
      scripts?: unknown;
      dependencies?: unknown;
      devDependencies?: unknown;
      optionalDependencies?: unknown;
    };
    const scripts =
      parsed.scripts &&
      typeof parsed.scripts === "object" &&
      !Array.isArray(parsed.scripts)
        ? Object.fromEntries(
            Object.entries(parsed.scripts).filter(
              (entry): entry is [string, string] =>
                typeof entry[1] === "string",
            ),
          )
        : {};
    let dependencyCount = 0;
    for (const group of [
      parsed.dependencies,
      parsed.devDependencies,
      parsed.optionalDependencies,
    ]) {
      if (group && typeof group === "object" && !Array.isArray(group)) {
        dependencyCount += Object.keys(group).length;
      }
    }

    return { path: "package.json", scripts, dependencyCount };
  } catch {
    return { path: "package.json", scripts: {}, dependencyCount: 0 };
  }
}

async function latestCommit(
  root: string,
  now: Date,
): Promise<CommitInfo | null> {
  const result = await runCommand(
    "git",
    ["log", "-1", "--format=%H%x00%s%x00%cI"],
    { cwd: root, allowFailure: true },
  );
  if (!result) return null;

  const [sha, subject, committedAt] = result.stdout.trim().split("\0");
  if (!sha || !subject || !committedAt) return null;
  const timestamp = Date.parse(committedAt);
  if (!Number.isFinite(timestamp)) return null;

  return {
    sha,
    subject,
    committedAt,
    ageDays: Math.max(
      0,
      Math.floor((now.getTime() - timestamp) / (24 * 60 * 60 * 1000)),
    ),
  };
}

async function localDefaultBranch(root: string): Promise<string | null> {
  const remote = await runCommand(
    "git",
    ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"],
    { cwd: root, allowFailure: true },
  );
  if (remote?.stdout.trim()) {
    return remote.stdout.trim().replace(/^origin\//, "");
  }

  const current = await runCommand("git", ["branch", "--show-current"], {
    cwd: root,
    allowFailure: true,
  });
  return current?.stdout.trim() || null;
}

async function fetchJson<T>(
  url: string,
  token: string | null,
  signal?: AbortSignal,
): Promise<{ status: number; value: T | null }> {
  const timeout = AbortSignal.timeout(8_000);
  const combinedSignal = signal
    ? AbortSignal.any([signal, timeout])
    : timeout;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "RepoLens/0.2.0",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const response = await fetch(url, { headers, signal: combinedSignal });
    if (!response.ok) return { status: response.status, value: null };
    return { status: response.status, value: (await response.json()) as T };
  } catch {
    return { status: 0, value: null };
  }
}

function unavailableReason(label: string, status: number): string {
  if (status === 0) return `${label}: network request failed or timed out`;
  if (status === 401) return `${label}: GitHub authentication failed`;
  if (status === 403 || status === 429) {
    return `${label}: GitHub permission or rate limit prevented inspection`;
  }
  return `${label}: GitHub API returned HTTP ${status}`;
}

async function githubMetadata(
  github: GitHubCoordinates,
  token: string | null,
  signal?: AbortSignal,
): Promise<GitHubMetadata> {
  const apiRoot = `https://api.github.com/repos/${encodeURIComponent(github.owner)}/${encodeURIComponent(github.repo)}`;
  const issueQuery = encodeURIComponent(
    `repo:${github.owner}/${github.repo} is:issue is:open`,
  );
  const pullQuery = encodeURIComponent(
    `repo:${github.owner}/${github.repo} is:pr is:open`,
  );

  const repository = await fetchJson<GitHubRepositoryResponse>(
    apiRoot,
    token,
    signal,
  );
  const defaultBranch = repository.value?.default_branch ?? null;
  const branchProtectionUrl = defaultBranch
    ? `${apiRoot}/branches/${encodeURIComponent(defaultBranch)}/protection`
    : null;

  const [release, issues, pulls, branchProtection, rulesets] = await Promise.all([
    fetchJson<GitHubReleaseResponse>(`${apiRoot}/releases/latest`, token, signal),
    fetchJson<GitHubSearchResponse>(
      `https://api.github.com/search/issues?q=${issueQuery}&per_page=1`,
      token,
      signal,
    ),
    fetchJson<GitHubSearchResponse>(
      `https://api.github.com/search/issues?q=${pullQuery}&per_page=1`,
      token,
      signal,
    ),
    branchProtectionUrl
      ? fetchJson<Record<string, unknown>>(
          branchProtectionUrl,
          token,
          signal,
        )
      : Promise.resolve({ status: 0, value: null }),
    fetchJson<GitHubRulesetResponse[]>(
      `${apiRoot}/rulesets?includes_parents=true`,
      token,
      signal,
    ),
  ]);

  const releaseValue = release.value;
  const normalizedRelease =
    releaseValue?.tag_name &&
    releaseValue.published_at &&
    releaseValue.html_url
      ? {
          tag: releaseValue.tag_name,
          name: releaseValue.name || releaseValue.tag_name,
          publishedAt: releaseValue.published_at,
          url: releaseValue.html_url,
        }
      : null;

  const available: string[] = [];
  const unavailable: string[] = [];
  const unknownReasons: string[] = [];
  if (repository.value) available.push("repository");
  else {
    unavailable.push("repository");
    unknownReasons.push(
      unavailableReason("repository metadata", repository.status),
    );
  }
  if (release.value || release.status === 404) available.push("latest release");
  else {
    unavailable.push("latest release");
    unknownReasons.push(
      unavailableReason("latest release metadata", release.status),
    );
  }
  if (typeof issues.value?.total_count === "number") {
    available.push("open issues");
  } else {
    unavailable.push("open issues");
    unknownReasons.push(unavailableReason("open issue count", issues.status));
  }
  if (typeof pulls.value?.total_count === "number") {
    available.push("open pull requests");
  } else {
    unavailable.push("open pull requests");
    unknownReasons.push(
      unavailableReason("open pull request count", pulls.status),
    );
  }

  let branchProtected: boolean | null = null;
  const rulesetProtectsDefault =
    Array.isArray(rulesets.value) &&
    rulesets.value.some((ruleset) => {
      if (
        ruleset.target !== "branch" ||
        !ruleset.enforcement ||
        ruleset.enforcement === "disabled"
      ) {
        return false;
      }
      const includes = ruleset.conditions?.ref_name?.include ?? [];
      return includes.some(
        (item) =>
          item === "~ALL" ||
          item === "~DEFAULT_BRANCH" ||
          item === `refs/heads/${defaultBranch ?? ""}`,
      );
    });
  if (branchProtection.status === 200 || rulesetProtectsDefault) {
    branchProtected = true;
    available.push("branch protection");
  } else if (
    branchProtection.status === 404 &&
    repository.value &&
    Array.isArray(rulesets.value)
  ) {
    branchProtected = false;
    available.push("branch protection");
  } else if (branchProtectionUrl) {
    unavailable.push("branch protection");
    unknownReasons.push(
      branchProtection.status !== 404
        ? unavailableReason("classic branch protection", branchProtection.status)
        : unavailableReason("repository rulesets", rulesets.status),
    );
  }

  const dependabotStatus =
    repository.value?.security_and_analysis?.dependabot_security_updates
      ?.status;
  const dependabotSecurityUpdates =
    dependabotStatus === "enabled"
      ? true
      : dependabotStatus === "disabled"
        ? false
        : null;
  if (dependabotSecurityUpdates === null) {
    unavailable.push("Dependabot security updates");
    if (repository.value) {
      unknownReasons.push(
        "Dependabot security update setting: insufficient repository metadata permission",
      );
    }
  } else {
    available.push("Dependabot security updates");
  }

  return {
    defaultBranch,
    branchProtected,
    dependabotSecurityUpdates,
    release: normalizedRelease,
    issues:
      typeof issues.value?.total_count === "number"
        ? issues.value.total_count
        : null,
    pullRequests:
      typeof pulls.value?.total_count === "number"
        ? pulls.value.total_count
        : null,
    available,
    unavailable,
    unknownReasons,
  };
}

async function npmDependencies(
  root: string,
): Promise<
  Array<{
    name: string;
    declared: string;
    scope: OutdatedDependency["scope"];
  }>
> {
  const packagePath = join(root, "package.json");
  const packageStat = await lstat(packagePath).catch(() => null);
  if (!packageStat?.isFile() || packageStat.isSymbolicLink()) return [];
  const raw = await readFile(packagePath, "utf8").catch(() => null);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result: Array<{
      name: string;
      declared: string;
      scope: OutdatedDependency["scope"];
    }> = [];
    for (const scope of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
    ] as const) {
      const group = parsed[scope];
      if (!group || typeof group !== "object" || Array.isArray(group)) continue;
      for (const [name, declared] of Object.entries(group)) {
        if (typeof declared === "string") result.push({ name, declared, scope });
      }
    }
    return result;
  } catch {
    return [];
  }
}

function supportsRegistryCheck(range: string): boolean {
  return (
    !/^(?:file:|git\+|github:|https?:|workspace:|link:|npm:)/i.test(range) &&
    semver.validRange(range) !== null
  );
}

async function outdatedDependencies(
  root: string,
  options: AuditOptions,
): Promise<{
  outdated: OutdatedDependency[];
  attempted: boolean;
  eligible: number;
  checked: number;
  status: Inventory["dependencyCheck"]["status"];
  skippedReason: string | null;
}> {
  const dependencies = await npmDependencies(root);
  if (dependencies.length === 0) {
    return {
      outdated: [],
      attempted: false,
      eligible: 0,
      checked: 0,
      status: "not-applicable",
      skippedReason: "No npm dependencies were found.",
    };
  }
  if (options.offline) {
    return {
      outdated: [],
      attempted: false,
      eligible: dependencies.filter((dependency) =>
        supportsRegistryCheck(dependency.declared),
      ).length,
      checked: 0,
      status: "offline",
      skippedReason: "Offline mode was requested.",
    };
  }

  const supported = dependencies.filter((dependency) =>
    supportsRegistryCheck(dependency.declared),
  );
  if (supported.length === 0) {
    return {
      outdated: [],
      attempted: false,
      eligible: 0,
      checked: 0,
      status: "not-applicable",
      skippedReason: "No supported npm semver ranges were found.",
    };
  }
  const candidates = supported.slice(0, 100);
  const outdated: OutdatedDependency[] = [];
  let checked = 0;

  for (let index = 0; index < candidates.length; index += 8) {
    const batch = candidates.slice(index, index + 8);
    await Promise.all(
      batch.map(async (dependency) => {
        const timeout = AbortSignal.timeout(5_000);
        try {
          const response = await fetch(
            `https://registry.npmjs.org/${encodeURIComponent(dependency.name)}/latest`,
            {
              headers: { "User-Agent": "RepoLens/0.2.0" },
              signal: options.signal
                ? AbortSignal.any([options.signal, timeout])
                : timeout,
            },
          );
          if (!response.ok) return;
          const payload = (await response.json()) as { version?: unknown };
          if (typeof payload.version !== "string") return;
          checked += 1;
          if (!semver.satisfies(payload.version, dependency.declared)) {
            outdated.push({
              ...dependency,
              latest: payload.version,
            });
          }
        } catch {
          // Best effort by design; an unavailable registry does not fail an audit.
        }
      }),
    );
  }

  outdated.sort((a, b) => a.name.localeCompare(b.name));
  const complete = checked === supported.length && supported.length <= 100;
  const status =
    checked === 0
      ? "unavailable"
      : complete
        ? "complete"
        : "partial";
  return {
    outdated,
    attempted: true,
    eligible: supported.length,
    checked,
    status,
    skippedReason:
      supported.length > 100
        ? "Only the first 100 supported npm dependencies were checked."
        : status === "unavailable"
          ? "The npm registry was unavailable."
          : status === "partial"
            ? `${checked} of ${supported.length} eligible npm dependencies were checked.`
          : null,
  };
}

export async function scanRepository(
  identity: RepositoryIdentity,
  options: AuditOptions,
): Promise<Inventory> {
  const root = identity.localPath;
  const { files: rawFiles, isGit } = await trackedFiles(root);
  const excludes = options.excludes ?? [];
  const excludedFiles = rawFiles.filter((path) =>
    isExcludedPath(path, excludes),
  );
  const files = rawFiles.filter((path) => !isExcludedPath(path, excludes));
  const workflowFiles = files.filter(isWorkflow);
  const [
    todos,
    packageJson,
    commit,
    branch,
    dependencyState,
    actionReferences,
  ] =
    await Promise.all([
      scanTodos(root, files, options.maxTodoMatches),
      packageInventory(root, files),
      isGit ? latestCommit(root, options.now) : Promise.resolve(null),
      isGit ? localDefaultBranch(root) : Promise.resolve(null),
      outdatedDependencies(root, options),
      unpinnedActions(root, workflowFiles),
    ]);

  const largeFiles: Array<{ path: string; bytes: number }> = [];
  for (const path of files) {
    const fileStat = await lstat(join(root, path)).catch(() => null);
    if (
      fileStat?.isFile() &&
      !fileStat.isSymbolicLink() &&
      fileStat.size >= options.largeFileBytes
    ) {
      largeFiles.push({ path, bytes: fileStat.size });
    }
  }
  largeFiles.sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path));

  let metadata: GitHubMetadata = {
    defaultBranch: branch,
    branchProtected: null,
    dependabotSecurityUpdates: null,
    release: null as ReleaseInfo | null,
    issues: null as number | null,
    pullRequests: null as number | null,
    available: [],
    unavailable: [],
    unknownReasons: [],
  };
  if (identity.github && !options.offline) {
    metadata = await githubMetadata(
      identity.github,
      options.githubToken,
      options.signal,
    );
    metadata.defaultBranch ||= branch;
  }

  const unknownReasons = [...metadata.unknownReasons];
  if (
    dependencyState.status === "unavailable" ||
    dependencyState.status === "partial"
  ) {
    unknownReasons.push(
      `npm dependency metadata: ${dependencyState.skippedReason ?? "inspection was incomplete"}`,
    );
  }
  const githubStatus =
    !identity.github
      ? "not-applicable"
      : options.offline
        ? "offline"
        : metadata.unavailable.length === 0
          ? "complete"
          : "partial";

  return {
    isGitRepository: isGit,
    trackedFiles: files,
    readmeFiles: files.filter(isReadme),
    licenseFiles: files.filter(isLicense),
    workflowFiles,
    lockfiles: files.filter((path) => LOCKFILE_NAMES.has(basename(path))),
    packageJson,
    todoMatches: todos.matches,
    todoTotal: todos.total,
    largeFiles,
    trackedEnvFiles: isGit ? files.filter(isTrackedEnvRisk) : [],
    securityFiles: files.filter(isSecurityFile),
    contributingFiles: files.filter(isContributingFile),
    dependencyUpdateFiles: files.filter(isDependencyUpdateFile),
    unpinnedActions: actionReferences,
    latestCommit: commit,
    defaultBranch: metadata.defaultBranch,
    branchProtected: metadata.branchProtected,
    dependabotSecurityUpdates: metadata.dependabotSecurityUpdates,
    latestRelease: metadata.release,
    openIssues: metadata.issues,
    openPullRequests: metadata.pullRequests,
    outdatedDependencies: dependencyState.outdated,
    dependencyCheck: {
      attempted: dependencyState.attempted,
      eligible: dependencyState.eligible,
      checked: dependencyState.checked,
      status: dependencyState.status,
      skippedReason: dependencyState.skippedReason,
    },
    coverage: {
      trackedFiles: rawFiles.length,
      includedFiles: files.length,
      excludedFiles: excludedFiles.length,
      excludes: [...excludes],
      todoTextFiles: todos.filesScanned,
      dependencyPackages: {
        eligible: dependencyState.eligible,
        checked: dependencyState.checked,
        status: dependencyState.status,
      },
      github: {
        status: githubStatus,
        available: metadata.available,
        unavailable: metadata.unavailable,
      },
      unknownReasons,
    },
  };
}
