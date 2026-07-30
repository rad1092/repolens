import { createRuleFinding } from "../rules.js";
import type { Evidence, Finding } from "../types.js";
import { location } from "./shared.js";

export interface ConfiguredCheck {
  area: string;
  evidence: string;
}

interface ConfiguredValidation {
  configured: ConfiguredCheck[];
}

export function configuredEvidence(
  validation: ConfiguredValidation,
): Evidence[] {
  return validation.configured.map((item) => ({
    label: item.area,
    value: item.evidence,
  }));
}

export function trackedEnvironmentFindings(paths: string[]): Finding[] {
  return paths.map((path) =>
    createRuleFinding({
      ruleId: "repository/tracked-env",
      stableIdentity: path,
      summary: `${path} is a tracked environment-file risk candidate.`,
      location: location(path, null),
      evidence: [{ label: "path", value: path }],
    }),
  );
}
