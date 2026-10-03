export type CapabilityAdoptionStatus =
  | 'REFERENCE'
  | 'CANDIDATE'
  | 'EVALUATED'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETIRED';

export interface CapabilityEvaluation {
  resourceId: string;
  status: CapabilityAdoptionStatus;
  availability: 'UNKNOWN' | 'AVAILABLE' | 'UNAVAILABLE';
  api: 'UNKNOWN' | 'PRESENT' | 'ABSENT';
  license: 'UNKNOWN' | 'COMPATIBLE' | 'INCOMPATIBLE' | 'RESTRICTED';
  pricing: 'UNKNOWN' | 'FREE' | 'PAID' | 'MIXED';
  security: 'UNKNOWN' | 'REVIEW_REQUIRED' | 'ACCEPTED' | 'REJECTED';
  privacy: 'UNKNOWN' | 'LOCAL' | 'CLOUD' | 'MIXED';
  compatibility: 'UNKNOWN' | 'COMPATIBLE' | 'INCOMPATIBLE';
  maturity: 'UNKNOWN' | 'EXPERIMENTAL' | 'STABLE' | 'DEPRECATED';
  evidenceRefs: readonly string[];
  evaluatedAt?: string;
}

export function validateCapabilityEvaluation(evaluation: CapabilityEvaluation): void {
  if (!evaluation.resourceId) {
    throw new Error('Capability evaluation requires resourceId');
  }
  if (evaluation.evidenceRefs.some((ref) => !ref)) {
    throw new Error('Capability evaluation evidence refs must be non-empty');
  }
  if (evaluation.status === 'APPROVED') {
    if (
      evaluation.security !== 'ACCEPTED' ||
      evaluation.compatibility !== 'COMPATIBLE' ||
      evaluation.availability !== 'AVAILABLE'
    ) {
      throw new Error('Approved capability requires security, compatibility and availability evidence');
    }
  }
  if (evaluation.status === 'RETIRED' && evaluation.api === 'PRESENT') {
    return;
  }
}
