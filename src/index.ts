export { auditTarget, createAuditReport } from "./audit.js";
export { compareWithBaseline, loadBaseline } from "./comparison.js";
export {
  DEFAULT_CONFIG,
  loadConfig,
  parseConfig,
  renderDefaultConfig,
} from "./config.js";
export { evaluatePolicy, policyExitCode } from "./policy.js";
export {
  renderGitHubMarkdown,
  renderHtml,
  renderJson,
  renderTerminal,
} from "./reporters.js";
export { runAudit } from "./runner.js";
export { prepareRepository, scanRepository } from "./scanner.js";
export type {
  AuditOptions,
  AuditReport,
  ComparisonChange,
  FailOn,
  Finding,
  Inventory,
  PolicyResult,
  RepoLensConfig,
  RepositoryIdentity,
  ScanCoverage,
  Severity,
} from "./types.js";
