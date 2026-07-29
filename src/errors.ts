export type RepoLensErrorCode =
  | "ACTION_SHA_UNAVAILABLE"
  | "BASELINE_EXPIRED"
  | "BASELINE_INVALID"
  | "BASELINE_MIGRATION_REQUIRED"
  | "BASELINE_TAMPERED"
  | "CONFIG_INVALID"
  | "EXECUTION_FAILED"
  | "WORKSPACE_BOUNDARY";

export class RepoLensError extends Error {
  readonly code: RepoLensErrorCode;

  constructor(code: RepoLensErrorCode, message: string) {
    super(message);
    this.name = "RepoLensError";
    this.code = code;
  }
}

export function asRepoLensError(error: unknown): RepoLensError {
  if (error instanceof RepoLensError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new RepoLensError("EXECUTION_FAILED", message);
}
