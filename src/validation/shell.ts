export function shellCommandSegments(command: string): string[] {
  const segments: string[] = [];
  let segment = "";
  let quote: "'" | '"' | "`" | null = null;
  let escaped = false;
  const push = () => {
    const normalized = segment.trim();
    if (normalized) segments.push(normalized);
    segment = "";
  };

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index] ?? "";
    if (escaped) {
      segment += character;
      escaped = false;
      continue;
    }
    if (quote) {
      segment += character;
      if (character === "\\" && quote !== "'") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "\\") {
      segment += character;
      escaped = true;
      continue;
    }
    if (
      character === "'" ||
      character === '"' ||
      character === "`"
    ) {
      segment += character;
      quote = character;
      continue;
    }
    if (
      character === "#" &&
      (segment.length === 0 || /\s$/.test(segment))
    ) {
      while (
        index + 1 < command.length &&
        command[index + 1] !== "\n"
      ) {
        index += 1;
      }
      push();
      continue;
    }
    const pair = command.slice(index, index + 2);
    if (
      character === "\n" ||
      character === "\r" ||
      character === ";" ||
      pair === "&&" ||
      pair === "||"
    ) {
      push();
      if (pair === "&&" || pair === "||") index += 1;
      continue;
    }
    segment += character;
  }
  push();
  return segments;
}

// Subcommands that are not package scripts. `pnpm <name>` and `yarn <name>`
// run the script <name> for anything else.
const PNPM_COMMANDS = new Set([
  "add", "audit", "bin", "config", "create", "dedupe", "deploy", "dlx", "doctor",
  "env", "exec", "fetch", "i", "import", "init", "install", "install-test",
  "licenses", "link", "list", "ls", "outdated", "pack", "patch", "patch-commit",
  "prune", "publish", "rebuild", "recursive", "remove", "rm", "root", "server",
  "setup", "store", "un", "uninstall", "unlink", "up", "update", "why",
]);
const YARN_COMMANDS = new Set([
  "add", "audit", "autoclean", "bin", "cache", "check", "config", "constraints",
  "create", "dedupe", "dlx", "exec", "explain", "generate-lock-entry", "global",
  "help", "import", "info", "init", "install", "licenses", "link", "list",
  "login", "logout", "node", "npm", "outdated", "owner", "pack", "patch",
  "patch-commit", "plugin", "policies", "publish", "rebuild", "remove",
  "search", "set", "tag", "team", "unlink", "unplug", "up", "upgrade",
  "upgrade-interactive", "version", "why", "workspace", "workspaces",
]);
// Flags that take a separate value, so the value is not read as a script.
const VALUE_FLAGS = new Set([
  "--filter", "-F", "--dir", "-C", "--prefix", "--workspace", "-w", "--cwd",
  "--reporter", "--loglevel",
]);
const NPM_BARE_SCRIPTS = new Set(["test", "start", "stop", "restart"]);

function words(segment: string): string[] {
  return segment.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
}

/**
 * Package scripts a shell command runs through npm, pnpm, Yarn or Bun, for
 * example `npm run lint`, `pnpm --filter web build` or `bun run test`.
 */
export function invokedPackageScripts(command: string): string[] {
  const scripts: string[] = [];
  for (const segment of shellCommandSegments(command)) {
    const tokens = words(segment);
    let index = 0;
    while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index]!)) {
      index += 1;
    }
    if (tokens[index] === "command" || tokens[index] === "exec") index += 1;
    const tool = tokens[index];
    if (tool !== "npm" && tool !== "pnpm" && tool !== "yarn" && tool !== "bun") {
      continue;
    }
    index += 1;
    const next = (): string | undefined => {
      while (index < tokens.length) {
        const token = tokens[index]!;
        if (!token.startsWith("-")) return token;
        index += 1;
        if (!token.includes("=") && VALUE_FLAGS.has(token)) index += 1;
      }
      return undefined;
    };
    const first = next();
    if (first === undefined) continue;
    if (first === "run" || first === "run-script") {
      index += 1;
      const script = next();
      if (script && /^[A-Za-z0-9:_-]+$/.test(script)) scripts.push(script);
      continue;
    }
    if (!/^[A-Za-z0-9:_-]+$/.test(first)) continue;
    if (tool === "npm" && NPM_BARE_SCRIPTS.has(first)) scripts.push(first);
    if (tool === "pnpm" && !PNPM_COMMANDS.has(first)) scripts.push(first);
    if (tool === "yarn" && !YARN_COMMANDS.has(first)) scripts.push(first);
    // `bun test` is Bun's own test runner, so Bun scripts need `bun run`.
  }
  return scripts;
}

export function reachableScripts(
  roots: string[],
  scripts: Record<string, string>,
): Set<string> {
  const reached = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const script = queue.shift();
    if (!script || reached.has(script)) continue;
    reached.add(script);
    const command = scripts[script];
    if (!command) continue;
    for (const nested of invokedPackageScripts(command)) {
      if (!reached.has(nested)) queue.push(nested);
    }
  }
  return reached;
}

export function isPlaceholderScript(command: string): boolean {
  const normalized = command.trim().replace(/\s+/g, " ");
  if (normalized.length === 0) return true;
  const segments = shellCommandSegments(command);
  return (
    segments.length === 0 ||
    segments.every((segment) =>
      /^(?:echo|printf)\b|^(?:false|true|:|(?:exit|return)\s+\d+)$|^node\s+-e\s+["']?(?:|process\.exit\(0\);?)["']?$/i.test(
        segment,
      ),
    )
  );
}
