import type { OracleEvidence, OracleValue } from '../oracle';
import { resolveImprovementEvidence } from './evidence';

export interface NativeToolEvidenceInput {
  toolCallId: string;
  toolAgentId?: string;
  producerAgentId: string;
  criterionId: string;
  value: OracleValue;
  runId?: string;
}

export interface NativeToolEvidenceResolution {
  evidence: OracleEvidence;
  independent: boolean;
  provenance: {
    toolCallId: string;
    runId?: string;
    toolAgentId?: string;
  };
}

function requiredText(name: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`NativeToolEvidence ${name} must be a non-empty string`);
  }
  return value.trim();
}

export function createNativeToolEvidence(
  input: NativeToolEvidenceInput,
): NativeToolEvidenceResolution {
  const toolCallId = requiredText('toolCallId', input.toolCallId);
  const producerAgentId = requiredText('producerAgentId', input.producerAgentId);
  const criterionId = requiredText('criterionId', input.criterionId);
  const toolAgentId =
    typeof input.toolAgentId === 'string' && input.toolAgentId.trim() !== ''
      ? input.toolAgentId.trim()
      : undefined;
  const runId =
    typeof input.runId === 'string' && input.runId.trim() !== '' ? input.runId.trim() : undefined;

  const resolved = resolveImprovementEvidence({
    id: toolCallId,
    criterionId,
    value: input.value,
    source: {
      id: toolCallId,
      type: 'tool',
      ...(toolAgentId == null ? {} : { agentId: toolAgentId }),
    },
    producerAgentId,
  });

  return {
    evidence: resolved.evidence,
    independent: resolved.independent,
    provenance: {
      toolCallId,
      ...(runId == null ? {} : { runId }),
      ...(toolAgentId == null ? {} : { toolAgentId }),
    },
  };
}
