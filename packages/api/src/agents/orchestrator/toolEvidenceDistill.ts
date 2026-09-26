import type { ImprovementCandidate } from './improvement';
import {
  resolveToolEvidenceIntent,
  type ToolEvidenceIntentDeclaration,
} from './toolEvidenceIntent';
import { createDistillValidationRequest } from './distill';
import { createNativeToolEvidence } from './toolEvidence';

export interface ToolEvidenceDistillInput {
  taskId: string;
  producerAgentId: string;
  candidate: ImprovementCandidate;
  toolName: string;
  toolCallId: string;
  toolAgentId?: string;
  runId?: string;
  declarations: readonly ToolEvidenceIntentDeclaration[];
}

export type ToolEvidenceDistillResolution =
  | { status: 'NO_DECLARATION' }
  | {
      status: 'READY';
      independent: boolean;
      oracleInput: ReturnType<typeof createDistillValidationRequest>['oracleInput'];
    };

/**
 * Pure composition boundary: explicit host semantics -> native tool provenance -> Distill input.
 * It does not execute tools, inspect raw tool output, call Oracle, authorize or persist anything.
 */
export function createToolEvidenceDistillRequest(
  input: ToolEvidenceDistillInput,
): ToolEvidenceDistillResolution {
  const intent = resolveToolEvidenceIntent({
    toolName: input.toolName,
    declarations: input.declarations,
  });
  if (intent == null) {
    return { status: 'NO_DECLARATION' };
  }

  const toolEvidence = createNativeToolEvidence({
    toolCallId: input.toolCallId,
    ...(input.toolAgentId == null ? {} : { toolAgentId: input.toolAgentId }),
    producerAgentId: input.producerAgentId,
    criterionId: intent.criterionId,
    value: intent.value,
    ...(input.runId == null ? {} : { runId: input.runId }),
  });

  const request = createDistillValidationRequest({
    taskId: input.taskId,
    producerAgentId: input.producerAgentId,
    candidate: input.candidate,
    evidence: [toolEvidence.evidence],
  });

  return {
    status: 'READY',
    independent: toolEvidence.independent,
    oracleInput: request.oracleInput,
  };
}
