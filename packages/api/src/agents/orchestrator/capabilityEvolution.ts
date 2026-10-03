export const capabilityEvolutionStages = [
  'DISCOVER',
  'EXTRACT_CAPABILITY',
  'ARCHITECTURE_MAPPING',
  'GAP_ANALYSIS',
  'DUPLICATION_ANALYSIS',
  'COMPATIBILITY',
  'LICENSE',
  'MATURITY',
  'VALUE',
  'COST',
  'RISK',
  'SANDBOX',
  'BENCHMARK',
  'ORACLE',
  'PROPOSAL',
] as const;

export type CapabilityEvolutionStage = (typeof capabilityEvolutionStages)[number];

export type CapabilityEvolutionStatus =
  | 'REFERENCE'
  | 'CANDIDATE'
  | 'EVALUATED'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETIRED';

export interface CapabilityEvolutionCandidate {
  resourceId: string;
  stage: CapabilityEvolutionStage;
  status: CapabilityEvolutionStatus;
  sourceRefs: readonly string[];
  capabilityIds: readonly string[];
  evidenceRefs: readonly string[];
  blockers: readonly string[];
  proposedAt?: string;
}

function requireText(name: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Capability evolution ${name} must be non-empty`);
  }
  return value.trim();
}

function uniqueNonEmpty(name: string, values: readonly string[]): string[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`Capability evolution ${name} must contain at least one value`);
  }
  const result = values.map((value) => requireText(name, value));
  if (new Set(result).size !== result.length) {
    throw new Error(`Capability evolution ${name} must be unique`);
  }
  return result;
}

function assertValidStage(stage: CapabilityEvolutionStage): void {
  if (!capabilityEvolutionStages.includes(stage)) {
    throw new Error(`Unsupported capability evolution stage: ${stage}`);
  }
}

/**
 * Pure, host-owned contract for capability evolution. It records only bounded
 * discovery/evaluation metadata. It never discovers, executes, authorizes,
 * persists, schedules, or mutates a capability.
 */
export function createCapabilityEvolutionCandidate(input: CapabilityEvolutionCandidate): CapabilityEvolutionCandidate {
  const resourceId = requireText('resourceId', input.resourceId);
  assertValidStage(input.stage);
  const sourceRefs = uniqueNonEmpty('sourceRefs', input.sourceRefs);
  const capabilityIds = uniqueNonEmpty('capabilityIds', input.capabilityIds);
  const evidenceRefs = input.evidenceRefs.map((value) => requireText('evidenceRefs', value));
  const blockers = input.blockers.map((value) => requireText('blockers', value));
  if (new Set(evidenceRefs).size !== evidenceRefs.length) {
    throw new Error('Capability evolution evidenceRefs must be unique');
  }
  if (new Set(blockers).size !== blockers.length) {
    throw new Error('Capability evolution blockers must be unique');
  }
  if (input.status === 'APPROVED' && (input.stage !== 'PROPOSAL' || blockers.length > 0 || evidenceRefs.length === 0)) {
    throw new Error('Approved capability evolution requires an unblocked proposal with evidence');
  }
  if (input.proposedAt !== undefined && !Number.isFinite(Date.parse(input.proposedAt))) {
    throw new Error('Capability evolution proposedAt must be a valid date');
  }
  return {
    resourceId,
    stage: input.stage,
    status: input.status,
    sourceRefs,
    capabilityIds,
    evidenceRefs,
    blockers,
    ...(input.proposedAt ? { proposedAt: input.proposedAt } : {}),
  };
}
