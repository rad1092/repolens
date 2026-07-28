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
): Promise<{ matches: TodoMatch[]; total: number }> {
  const matches: TodoMatch[] = [];
  let total = 0;

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

  return { matches, total };
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
    "User-Agent": "RepoLens/0.1.1",
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

async function githubMetadata(
  github: GitHubCoordinates,
  token: string | null,
  signal?: AbortSignal,
): Promise<{
  defaultBranch: string | null;
  release: ReleaseInfo | null;
  issues: number | null;
  pullRequests: number | null;
}> {
  const apiRoot = `https://api.github.com/repos/${encodeURIComponent(github.owner)}/${encodeURIComponent(github.repo)}`;
  const issueQuery = encodeURIComponent(
    `repo:${github.owner}/${github.repo} is:issue is:open`,
  );
  const pullQuery = encodeURIComponent(
    `repo:${github.owner}/${github.repo} is:pr is:open`,
  );

  const [repository, release, issues, pulls] = await Promise.all([
    fetchJson<GitHubRepositoryResponse>(apiRoot, token, signal),
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

  return {
    defaultBranch: repository.value?.default_branch ?? null,
    release: normalizedRelease,
    issues:
      typeof issues.value?.total_count === "number"
        ? issues.value.total_count
        : null,
    pullRequests:
      typeof pulls.value?.total_count === "number"
        ? pulls.value.total_count
        : null,
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
  checked: number;
  skippedReason: string | null;
}> {
  const dependencies = await npmDependencies(root);
  if (dependencies.length === 0) {
    return {
      outdated: [],
      attempted: false,
      checked: 0,
      skippedReason: "No npm dependencies were found.",
    };
  }
  if (options.offline) {
    return {
      outdated: [],
      attempted: false,
      checked: 0,
      skippedReason: "Offline mode was requested.",
    };
  }

  const supported = dependencies.filter((dependency) =>
    supportsRegistryCheck(dependency.declared),
  );
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
              headers: { "User-Agent": "RepoLens/0.1.1" },
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
  return {
    outdated,
    attempted: true,
    checked,
    skippedReason:
      supported.length > 100
        ? "Only the first 100 supported npm dependencies were checked."
        : checked === 0
          ? "The npm registry was unavailable."
          : null,
  };
}

export async function scanRepository(
  identity: RepositoryIdentity,
  options: AuditOptions,
): Promise<Inventory> {
  const root = identity.localPath;
  const { files, isGit } = await trackedFiles(root);
  const [todos, packageJson, commit, branch, dependencyState] =
    await Promise.all([
      scanTodos(root, files, options.maxTodoMatches),
      packageInventory(root, files),
      isGit ? latestCommit(root, options.now) : Promise.resolve(null),
      isGit ? localDefaultBranch(root) : Promise.resolve(null),
      outdatedDependencies(root, options),
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

  let metadata = {
    defaultBranch: branch,
    release: null as ReleaseInfo | null,
    issues: null as number | null,
    pullRequests: null as number | null,
  };
  if (identity.github && !options.offline) {
    metadata = await githubMetadata(
      identity.github,
      options.githubToken,
      options.signal,
    );
    metadata.defaultBranch ||= branch;
  }

  return {
    isGitRepository: isGit,
    trackedFiles: files,
    readmeFiles: files.filter(isReadme),
    licenseFiles: files.filter(isLicense),
    workflowFiles: files.filter(isWorkflow),
    lockfiles: files.filter((path) => LOCKFILE_NAMES.has(basename(path))),
    packageJson,
    todoMatches: todos.matches,
    todoTotal: todos.total,
    largeFiles,
    trackedEnvFiles: isGit ? files.filter(isTrackedEnvRisk) : [],
    securityFiles: files.filter(isSecurityFile),
    contributingFiles: files.filter(isContributingFile),
    latestCommit: commit,
    defaultBranch: metadata.defaultBranch,
    latestRelease: metadata.release,
    openIssues: metadata.issues,
    openPullRequests: metadata.pullRequests,
    outdatedDependencies: dependencyState.outdated,
    dependencyCheck: {
      attempted: dependencyState.attempted,
      checked: dependencyState.checked,
      skippedReason: dependencyState.skippedReason,
    },
  };
}
