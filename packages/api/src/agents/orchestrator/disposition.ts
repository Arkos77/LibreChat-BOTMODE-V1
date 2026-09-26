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

/**
 * Converts a completed Oracle result into a bounded improvement disposition.
 * Oracle ACCEPT establishes QA conformance only and grants no authority.
 */
export function createImprovementDisposition(
  input: ImprovementDispositionInput,
): ImprovementDisposition {
  const { candidate, oracle } = input;

  if (oracle.phase === 'CANDIDATE' || oracle.phase === 'VALIDATING') {
    throw new Error('Oracle result must be terminal before improvement disposition');
  }

  if (EXPECTED_PHASE[oracle.decision] !== oracle.phase || oracle.verdict.status !== oracle.phase) {
    throw new Error('Oracle phase, verdict status and decision must agree');
  }

  return {
    candidateId: candidate.candidateId,
    traceId: candidate.traceId,
    target: candidate.target,
    oracleDecision: oracle.decision,
    disposition: dispositionFor(candidate, oracle.decision),
    publicationPath: candidate.publication.path,
    authorized: false,
    publishable: false,
    requiresHumanReview:
      oracle.decision === 'REQUEST_HUMAN_REVIEW' || candidate.publication.requiresHumanReview,
  };
}
