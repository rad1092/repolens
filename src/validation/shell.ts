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

export function invokedNpmScripts(command: string): string[] {
  const scripts: string[] = [];
  const expression =
    /^(?:(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]+))\s+)*(?:(?:command|exec)\s+)?npm\s+(?:--[^\s]+\s+)*(?:(run|run-script)\s+)?([A-Za-z0-9:_-]+)(?:\s|$)/;
  for (const segment of shellCommandSegments(command)) {
    const match = expression.exec(segment);
    if (!match) continue;
    const explicitRun = match[1] !== undefined;
    const script = match[2];
    if (!script) continue;
    if (
      explicitRun ||
      script === "test" ||
      script === "start" ||
      script === "stop" ||
      script === "restart"
    ) {
      scripts.push(script);
    }
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
    for (const nested of invokedNpmScripts(command)) {
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
