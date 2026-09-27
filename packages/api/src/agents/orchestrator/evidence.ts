import type { OracleEvidence, OracleValue } from '../oracle';

export type ImprovementEvidenceSourceType = OracleEvidence['source']['type'];

export interface ImprovementEvidenceInput {
  id: string;
  criterionId: string;
  value: OracleValue;
  source: {
    id: string;
    type: ImprovementEvidenceSourceType;
    agentId?: string;
  };
  producerAgentId: string;
  requireIndependentEvidence?: boolean;
}

export interface ImprovementEvidenceResolution {
  evidence: OracleEvidence;
  independent: boolean;
}

function requiredText(name: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`ImprovementEvidence ${name} must be a non-empty string`);
  }
  return value.trim();
}

export function resolveImprovementEvidence(
  input: ImprovementEvidenceInput,
): ImprovementEvidenceResolution {
  const id = requiredText('id', input.id);
  const criterionId = requiredText('criterionId', input.criterionId);
  const sourceId = requiredText('source.id', input.source.id);
  const producerAgentId = requiredText('producerAgentId', input.producerAgentId);
  const sourceAgentId =
    typeof input.source.agentId === 'string' && input.source.agentId.trim() !== ''
      ? input.source.agentId.trim()
      : undefined;

  const independent =
    sourceId !== producerAgentId &&
    sourceAgentId !== producerAgentId &&
    (input.source.type === 'source' || (input.source.type === 'tool' && sourceAgentId != null));

  if (input.requireIndependentEvidence === true && !independent) {
    throw new Error('ImprovementEvidence independent evidence is required');
  }

  return {
    independent,
    evidence: {
      id,
      criterionId,
      value: input.value,
      source: {
        id: sourceId,
        type: input.source.type,
        ...(sourceAgentId == null ? {} : { agentId: sourceAgentId }),
      },
    },
  };
}

export function collectIndependentImprovementEvidence(
  inputs: readonly ImprovementEvidenceInput[],
): OracleEvidence[] {
  return inputs
    .map((input) => resolveImprovementEvidence({ ...input, requireIndependentEvidence: true }))
    .map((resolved) => resolved.evidence);
}
