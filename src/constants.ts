export const TOOL_NAME = "RepoLens" as const;
export const TOOL_VERSION = "0.1.0";

export const DEFAULT_STALE_DAYS = 180;
export const DEFAULT_LARGE_FILE_BYTES = 1024 * 1024;
export const DEFAULT_MAX_TODO_MATCHES = 50;

export const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "coverage",
  ".next",
  ".cache",
  ".turbo",
  "target"
]);

export const LOCKFILE_NAMES = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "Cargo.lock",
  "go.sum",
  "Gemfile.lock",
  "poetry.lock",
  "Pipfile.lock",
  "uv.lock",
  "composer.lock"
]);
