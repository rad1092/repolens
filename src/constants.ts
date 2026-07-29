export const TOOL_NAME = "RepoLens" as const;
export const TOOL_VERSION = "0.3.0";

export const DEFAULT_CONFIG_FILE = ".repolens.json";
export const DEFAULT_EXCLUDES = [
  "**/.repolens/**",
  "**/fixtures/**",
  "**/__fixtures__/**",
  "**/testdata/**",
] as const;

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
