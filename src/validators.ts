import type {
  Evidence,
  Finding,
  Inventory,
} from "./types.js";
import { validateDependabot } from "./validation/dependabot.js";
import {
  configuredEvidence as buildConfiguredEvidence,
  trackedEnvironmentFindings,
  type ConfiguredCheck,
} from "./validation/evidence.js";
import {
  validateNodeProject,
  type NodeContract,
} from "./validation/node.js";
import { validateWorkflows } from "./validation/workflows.js";

export type { NodeContract } from "./validation/node.js";

export interface RepositoryValidation {
  findings: Finding[];
  node: NodeContract;
  configured: ConfiguredCheck[];
}

export async function validateRepository(
  root: string,
  inventory: Inventory,
): Promise<RepositoryValidation> {
  const files = new Set(inventory.trackedFiles);
  const nodeValidation = await validateNodeProject(root, files);
  const workflowValidation = await validateWorkflows(
    root,
    files,
    inventory,
    nodeValidation.node,
  );
  const dependabotValidation = await validateDependabot(
    root,
    files,
    inventory,
    nodeValidation.node.manifest !== null,
  );

  return {
    findings: [
      ...nodeValidation.findings,
      ...workflowValidation.findings,
      ...dependabotValidation.findings,
      ...trackedEnvironmentFindings(inventory.trackedEnvFiles),
    ],
    node: nodeValidation.node,
    configured: [
      ...nodeValidation.configured,
      ...workflowValidation.configured,
      ...dependabotValidation.configured,
    ],
  };
}

export function configuredEvidence(
  validation: RepositoryValidation,
): Evidence[] {
  return buildConfiguredEvidence(validation);
}
