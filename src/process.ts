import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export async function runCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    allowFailure?: boolean;
  } = {},
): Promise<CommandResult | null> {
  try {
    const result = await execFileAsync(command, args, {
      cwd: options.cwd,
      env: options.env,
      timeout: options.timeoutMs ?? 15_000,
      maxBuffer: 16 * 1024 * 1024,
      encoding: "utf8",
      windowsHide: true,
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    if (options.allowFailure) return null;

    const detail =
      error instanceof Error ? error.message.replaceAll(/Authorization:[^\n]+/gi, "Authorization: [redacted]") : String(error);
    throw new Error(`Command failed: ${command} (${detail})`);
  }
}
