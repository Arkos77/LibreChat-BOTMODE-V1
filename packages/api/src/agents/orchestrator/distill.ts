import type { OracleEvidence, OracleInput } from '../oracle';
import type { ImprovementCandidate } from './improvement';

export interface DistillValidationRequest {
  candidateId: string;
  traceId: string;
  oracleInput: OracleInput;
}

export interface DistillValidationRequestInput {
  taskId: string;
  producerAgentId: string;
  candidate: ImprovementCandidate;
  evidence: readonly OracleEvidence[];
}

const DISTILL_CRITERION_IDS = new Set(['candidateId', 'target', 'status', 'traceId']);

function requiredText(name: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`DistillValidationRequest ${name} must be a non-empty string`);
  }
  return value.trim();
}

/**
 * Prepares the bounded host-owned validation input for an improvement candidate.
 *
 * This boundary does not invoke Oracle, interpret a verdict, authorize an action,
 * publish a skill, persist state, schedule work, or mutate the source candidate.
 */
export function createDistillValidationRequest(
  input: DistillValidationRequestInput,
): DistillValidationRequest {
  const taskId = requiredText('taskId', input.taskId);
  const producerAgentId = requiredText('producerAgentId', input.producerAgentId);
  const candidateId = requiredText('candidateId', input.candidate.candidateId);
  const traceId = requiredText('traceId', input.candidate.traceId);

  const evidence = structuredClone(input.evidence);
  for (const item of evidence) {
    if (!DISTILL_CRITERION_IDS.has(item.criterionId)) {
      throw new Error(
        `DistillValidationRequest evidence criterionId is not supported: ${item.criterionId}`,
      );
    }
  }

  const candidateSnapshot = JSON.stringify({
    candidateId,
    target: input.candidate.target,
    status: input.candidate.status,
    traceId,
  });

  return {
    candidateId,
    traceId,
    oracleInput: {
      taskId,
      agentId: producerAgentId,
      candidate: candidateSnapshot,
      criteria: [
        { id: 'candidateId', field: 'candidateId', expected: candidateId },
        {
          id: 'target',
          field: 'target',
          expected: input.candidate.target,
          requireEvidence: true,
        },
        { id: 'status', field: 'status', expected: 'CANDIDATE' },
        { id: 'traceId', field: 'traceId', expected: traceId },
      ],
      evidence,
    },
  };
}
