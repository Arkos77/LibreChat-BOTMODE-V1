import type {
  ImprovementCandidate,
  ImprovementPublicationPath,
  ImprovementTarget,
} from './improvement';
import type { OracleDecision, OracleEvent, OracleStatus } from '../oracle';

export type ImprovementDispositionStatus =
  | 'AUTHORIZATION_REQUIRED'
  | 'PROPOSAL_ONLY'
  | 'REJECTED'
  | 'DEFERRED'
  | 'HUMAN_REVIEW_REQUIRED';

export interface ImprovementDisposition {
  candidateId: string;
  traceId: string;
  target: ImprovementTarget;
  payloadDigest?: string;
  oracleDecision: OracleDecision;
  disposition: ImprovementDispositionStatus;
  publicationPath: ImprovementPublicationPath;
  authorized: false;
  publishable: false;
  requiresHumanReview: boolean;
}

type TerminalOracleResult = Extract<OracleEvent, { verdict: unknown }>;

export interface ImprovementDispositionInput {
  candidate: ImprovementCandidate;
  oracle: TerminalOracleResult;
}

const EXPECTED_PHASE: Record<OracleDecision, OracleStatus> = {
  ACCEPT: 'VERIFIED',
  REJECT: 'REJECTED',
  DEFER: 'UNKNOWN',
  REQUEST_HUMAN_REVIEW: 'HUMAN_REVIEW',
};

function dispositionFor(
  candidate: ImprovementCandidate,
  decision: OracleDecision,
): ImprovementDispositionStatus {
  if (decision === 'REJECT') return 'REJECTED';
  if (decision === 'DEFER') return 'DEFERRED';
  if (decision === 'REQUEST_HUMAN_REVIEW') return 'HUMAN_REVIEW_REQUIRED';
  return candidate.target === 'skill' ? 'AUTHORIZATION_REQUIRED' : 'PROPOSAL_ONLY';
}

function readOracleCandidateSnapshot(candidate: string | undefined): Record<string, unknown> {
  if (!candidate) {
    throw new Error('Oracle verdict is missing the validated candidate snapshot');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new Error('Oracle verdict candidate snapshot is invalid JSON');
  }

  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Oracle verdict candidate snapshot is invalid');
  }

  return parsed as Record<string, unknown>;
}

function assertAcceptedOracleBinding(
  candidate: ImprovementCandidate,
  oracle: TerminalOracleResult,
): void {
  if (oracle.decision !== 'ACCEPT') return;

  const snapshot = readOracleCandidateSnapshot(oracle.verdict.input.candidate);
  if (
    snapshot.candidateId !== candidate.candidateId ||
    snapshot.target !== candidate.target ||
    snapshot.status !== candidate.status ||
    snapshot.traceId !== candidate.traceId
  ) {
    throw new Error('Oracle verdict candidate snapshot does not match improvement candidate');
  }

  if (candidate.target === 'skill') {
    if (!candidate.payloadDigest || snapshot.payloadDigest !== candidate.payloadDigest) {
      throw new Error('Oracle verdict payload digest does not match improvement candidate');
    }
  }
}

export function createImprovementDisposition(
  input: ImprovementDispositionInput,
): ImprovementDisposition {
  const { candidate, oracle } = input;

  if (!Object.values(EXPECTED_PHASE).includes(oracle.phase)) {
    throw new Error('Oracle result must be terminal before improvement disposition');
  }

  if (EXPECTED_PHASE[oracle.decision] !== oracle.phase || oracle.verdict.status !== oracle.phase) {
    throw new Error('Oracle phase, verdict status and decision must agree');
  }

  assertAcceptedOracleBinding(candidate, oracle);

  return {
    candidateId: candidate.candidateId,
    traceId: candidate.traceId,
    target: candidate.target,
    ...(candidate.payloadDigest ? { payloadDigest: candidate.payloadDigest } : {}),
    oracleDecision: oracle.decision,
    disposition: dispositionFor(candidate, oracle.decision),
    publicationPath: candidate.publication.path,
    authorized: false,
    publishable: false,
    requiresHumanReview:
      oracle.decision === 'REQUEST_HUMAN_REVIEW' || candidate.publication.requiresHumanReview,
  };
}
