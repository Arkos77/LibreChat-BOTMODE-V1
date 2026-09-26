import type { MtoEvent, MtoOracleObservation } from './mto';

export const improvementTargets = ['skill', 'agent', 'workflow', 'specialist'] as const;

export type ImprovementTarget = (typeof improvementTargets)[number];

export type ImprovementPublicationPath = 'native-skill-authoring-required' | 'proposal-only';

export interface ImprovementSignalAggregate {
  observationCount: number;
  sourceCounts: Partial<Record<MtoEvent['source'], number>>;
  typeCounts: Partial<Record<MtoEvent['type'], number>>;
  oracle: {
    verified: number;
    rejected: number;
    humanReview: number;
    unknown: number;
    reasonCodes: Record<string, number>;
  };
}

export interface ImprovementCandidate {
  candidateId: string;
  target: ImprovementTarget;
  status: 'CANDIDATE';
  title: string;
  summary: string;
  traceId: string;
  traceEventIds: string[];
  signals: ImprovementSignalAggregate;
  publication: {
    path: ImprovementPublicationPath;
    /** A publication path is not authorization to publish. */
    requiresOracle: true;
    requiresAuthorization: true;
    requiresHumanReview: boolean;
  };
  createdAt: string;
}

export interface ImprovementCandidateInput {
  candidateId: string;
  target: ImprovementTarget;
  title: string;
  summary: string;
  traceId: string;
  observations: readonly MtoEvent[];
  requiresHumanReview?: boolean;
  createdAt?: string;
}

function requiredText(name: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`ImprovementCandidate ${name} must be a non-empty string`);
  }
  return value.trim();
}

function increment<T extends string>(record: Partial<Record<T, number>>, key: T): void {
  record[key] = (record[key] ?? 0) + 1;
}

function isOraclePayload(payload: unknown): payload is MtoOracleObservation {
  if (payload == null || typeof payload !== 'object') return false;
  const value = payload as Partial<MtoOracleObservation>;
  return (
    value.phase === 'CANDIDATE' ||
    value.phase === 'VALIDATING' ||
    value.phase === 'VERIFIED' ||
    value.phase === 'REJECTED' ||
    value.phase === 'UNKNOWN' ||
    value.phase === 'HUMAN_REVIEW'
  );
}

function requiredTarget(value: unknown): ImprovementTarget {
  if (typeof value !== 'string' || !improvementTargets.includes(value as ImprovementTarget)) {
    throw new Error('ImprovementCandidate target is not supported');
  }
  return value as ImprovementTarget;
}

/**
 * Deterministic pattern summary over already-sanitized MTO metadata.
 * It does not inspect activity data, raw candidates, evidence values or reasoning.
 */
export function summarizeImprovementSignals(
  observations: readonly MtoEvent[],
): ImprovementSignalAggregate {
  const sourceCounts: ImprovementSignalAggregate['sourceCounts'] = {};
  const typeCounts: ImprovementSignalAggregate['typeCounts'] = {};
  const oracle: ImprovementSignalAggregate['oracle'] = {
    verified: 0,
    rejected: 0,
    humanReview: 0,
    unknown: 0,
    reasonCodes: {},
  };

  for (const observation of observations) {
    increment(sourceCounts, observation.source);
    increment(typeCounts, observation.type);
    if (observation.source !== 'oracle' || !isOraclePayload(observation.payload)) {
      continue;
    }
    if (observation.payload.phase === 'VERIFIED') oracle.verified += 1;
    else if (observation.payload.phase === 'REJECTED') oracle.rejected += 1;
    else if (observation.payload.phase === 'HUMAN_REVIEW') oracle.humanReview += 1;
    else if (observation.payload.phase === 'UNKNOWN') oracle.unknown += 1;
    for (const code of observation.payload.reasonCodes ?? []) {
      oracle.reasonCodes[code] = (oracle.reasonCodes[code] ?? 0) + 1;
    }
  }

  return {
    observationCount: observations.length,
    sourceCounts,
    typeCounts,
    oracle,
  };
}

function publicationPath(target: ImprovementTarget): ImprovementPublicationPath {
  return target === 'skill' ? 'native-skill-authoring-required' : 'proposal-only';
}

/**
 * Dream boundary: creates a proposal from sanitized observations only.
 * This function does not persist, authorize, validate, publish, schedule or mutate runtime state.
 */
export function createImprovementCandidate(input: ImprovementCandidateInput): ImprovementCandidate {
  const candidateId = requiredText('candidateId', input.candidateId);
  const target = requiredTarget(input.target);
  const traceId = requiredText('traceId', input.traceId);
  const title = requiredText('title', input.title);
  const summary = requiredText('summary', input.summary);

  if (input.observations.length === 0) {
    throw new Error('ImprovementCandidate requires at least one observation');
  }
  for (const observation of input.observations) {
    if (observation.identity.traceId !== traceId) {
      throw new Error('ImprovementCandidate observations must share the candidate traceId');
    }
  }

  const traceEventIds = Array.from(
    new Set(input.observations.map((observation) => observation.identity.traceEventId)),
  ).sort();

  return {
    candidateId,
    target,
    status: 'CANDIDATE',
    title,
    summary,
    traceId,
    traceEventIds,
    signals: summarizeImprovementSignals(input.observations),
    publication: {
      path: publicationPath(target),
      requiresOracle: true,
      requiresAuthorization: true,
      requiresHumanReview: input.requiresHumanReview === true,
    },
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}
