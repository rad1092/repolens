import {
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  basename,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

import { minimatch } from "minimatch";
import semver from "semver";

import { IGNORED_DIRECTORIES, TOOL_VERSION } from "./constants.js";
import { runCommand } from "./process.js";
import type {
  AuditOptions,
  Inventory,
  OutdatedDependency,
  RepositoryIdentity,
  ScanCoverage,
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
  const ssh = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i.exec(
    trimmed,
  );
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
  return (await stat(path).catch(() => null))?.isDirectory() === true;
}

async function localGitHubRemote(
  root: string,
): Promise<GitHubCoordinates | null> {
  const result = await runCommand(
    "git",
    ["remote", "get-url", "origin"],
    { cwd: root, allowFailure: true },
  );
  return result ? githubCoordinates(result.stdout.trim()) : null;
}

export async function prepareRepository(
  target: string,
  githubToken: string | null,
): Promise<PreparedRepository> {
  if (/^https?:\/\//i.test(target)) {
    const parsed = new URL(target);
    if (parsed.username || parsed.password || parsed.search) {
      throw new Error(
        "Credentials and query parameters in repository URLs are not accepted; use --token-env.",
      );
    }
  }

  const localPath = resolve(target);
  if (await pathIsDirectory(localPath)) {
    return {
      identity: {
        input: target,
        kind: "local",
        name: basename(localPath),
        localPath,
        github: await localGitHubRemote(localPath),
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
    cleanup: () => rm(temporaryRoot, { recursive: true, force: true }),
  };
}

async function walkFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) {
        files.push(normalizePath(relative(root, absolute)));
      }
    }
  }

  await visit(root);
  return files.sort((left, right) => left.localeCompare(right));
}

async function repositoryFiles(root: string): Promise<{
  files: string[];
  isGit: boolean;
}> {
  const topLevel = await runCommand(
    "git",
    ["rev-parse", "--show-toplevel"],
    { cwd: root, allowFailure: true },
  );
  if (!topLevel) return { files: await walkFiles(root), isGit: false };

  const result = await runCommand(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, allowFailure: true },
  );
  if (!result) return { files: await walkFiles(root), isGit: false };

  const files = result.stdout
    .split("\0")
    .filter(Boolean)
    .map(normalizePath)
    .filter(
      (path) =>
        !path
          .split("/")
          .some((segment) => IGNORED_DIRECTORIES.has(segment)),
    )
    .sort((left, right) => left.localeCompare(right));
  return { files, isGit: true };
}

function isWorkflow(path: string): boolean {
  return /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(path);
}

const SAFE_ENV_EXAMPLES = new Set([
  ".env.example",
  ".env.sample",
  ".env.template",
  ".env.defaults",
]);

function isTrackedEnvRisk(path: string): boolean {
  const name = basename(path).toLowerCase();
  if (SAFE_ENV_EXAMPLES.has(name)) return false;
  return name === ".env" || name.startsWith(".env.");
}

async function npmDependencies(
  root: string,
  files: string[],
): Promise<
  Array<{
    name: string;
    declared: string;
    scope: OutdatedDependency["scope"];
  }>
> {
  if (!files.includes("package.json")) return [];
  const packagePath = join(root, "package.json");
  const packageStat = await lstat(packagePath).catch(() => null);
  if (!packageStat?.isFile() || packageStat.isSymbolicLink()) return [];
  const raw = await readFile(packagePath, "utf8").catch(() => null);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const dependencies: Array<{
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
      if (!group || typeof group !== "object" || Array.isArray(group)) {
        continue;
      }
      for (const [name, declared] of Object.entries(group)) {
        if (typeof declared === "string") {
          dependencies.push({ name, declared, scope });
        }
      }
    }
    return dependencies;
  } catch {
    return [];
  }
}

function supportsRegistryCheck(range: string): boolean {
  return (
    !/^(?:file:|git\+|github:|https?:|workspace:|link:|npm:)/i.test(
      range,
    ) && semver.validRange(range) !== null
  );
}

async function checkNpmUpdates(
  root: string,
  files: string[],
  options: AuditOptions,
): Promise<{
  outdated: OutdatedDependency[];
  eligible: number;
  checked: number;
  status: ScanCoverage["dependencyPackages"]["status"];
  skippedReason: string | null;
}> {
  const dependencies = (await npmDependencies(root, files)).filter(
    (dependency) => supportsRegistryCheck(dependency.declared),
  );
  if (dependencies.length === 0) {
    return {
      outdated: [],
      eligible: 0,
      checked: 0,
      status: "not-applicable",
      skippedReason: "No supported npm semver ranges were found.",
    };
  }
  if (options.offline) {
    return {
      outdated: [],
      eligible: dependencies.length,
      checked: 0,
      status: "offline",
      skippedReason: "Offline mode was requested.",
    };
  }

  const candidates = dependencies.slice(0, 100);
  const results = await Promise.all(
    candidates.map(async (dependency) => {
      const timeout = AbortSignal.timeout(5_000);
      try {
        const response = await fetch(
          `https://registry.npmjs.org/${encodeURIComponent(dependency.name)}/latest`,
          {
            headers: { "User-Agent": `RepoLens/${TOOL_VERSION}` },
            signal: options.signal
              ? AbortSignal.any([options.signal, timeout])
              : timeout,
          },
        );
        if (!response.ok) return null;
        const payload = (await response.json()) as { version?: unknown };
        if (typeof payload.version !== "string") return null;
        return {
          dependency,
          latest: payload.version,
        };
      } catch {
        return null;
      }
    }),
  );
  const available = results.filter(
    (
      result,
    ): result is {
      dependency: (typeof candidates)[number];
      latest: string;
    } => result !== null,
  );
  const outdated = available
    .filter(
      ({ dependency, latest }) =>
        !semver.satisfies(latest, dependency.declared),
    )
    .map(({ dependency, latest }) => ({ ...dependency, latest }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const complete =
    available.length === dependencies.length && dependencies.length <= 100;
  const status =
    available.length === 0
      ? "unavailable"
      : complete
        ? "complete"
        : "partial";
  const skippedReason =
    dependencies.length > 100
      ? "Only the first 100 supported npm dependencies were checked."
      : status === "unavailable"
        ? "The npm registry was unavailable."
        : status === "partial"
          ? `${available.length} of ${dependencies.length} eligible npm dependencies were checked.`
          : null;

  return {
    outdated,
    eligible: dependencies.length,
    checked: available.length,
    status,
    skippedReason,
  };
}

export async function scanRepository(
  identity: RepositoryIdentity,
  options: AuditOptions,
): Promise<Inventory> {
  const root = identity.localPath;
  const { files: discovered, isGit } = await repositoryFiles(root);
  const excludes = options.excludes ?? [];
  const excluded = discovered.filter((path) =>
    isExcludedPath(path, excludes),
  );
  const files = discovered.filter(
    (path) => !isExcludedPath(path, excludes),
  );
  const dependencyState = await checkNpmUpdates(root, files, options);
  const unknownReasons =
    dependencyState.status === "unavailable" ||
    dependencyState.status === "partial"
      ? [
          `npm dependency metadata: ${dependencyState.skippedReason ?? "inspection was incomplete"}`,
        ]
      : [];

  return {
    trackedFiles: files,
    workflowFiles: files.filter(isWorkflow),
    trackedEnvFiles: isGit ? files.filter(isTrackedEnvRisk) : [],
    outdatedDependencies: dependencyState.outdated,
    coverage: {
      trackedFiles: discovered.length,
      includedFiles: files.length,
      excludedFiles: excluded.length,
      excludes: [...excludes],
      dependencyPackages: {
        eligible: dependencyState.eligible,
        checked: dependencyState.checked,
        status: dependencyState.status,
      },
      unknownReasons,
    },
  };
}
