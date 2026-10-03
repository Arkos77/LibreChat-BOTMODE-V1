export type QaStatus = 'PASS' | 'FAIL' | 'UNKNOWN' | 'HUMAN_REVIEW';

export interface QaAuditInput {
  artifactId: string;
  expectedDigest?: string;
  observedDigest?: string;
  requiredFields?: readonly string[];
  observedFields?: readonly string[];
  evidenceRefs: readonly string[];
  requiresHumanReview?: boolean;
}

export interface QaAuditResult {
  status: QaStatus;
  artifactId: string;
  drift: readonly string[];
  evidenceRefs: readonly string[];
}

export function auditArtifactDrift(input: QaAuditInput): QaAuditResult {
  if (!input.artifactId) throw new Error('QA artifactId is required');
  if (input.evidenceRefs.some((ref) => !ref.trim())) throw new Error('QA evidence refs must be non-empty');
  const drift: string[] = [];
  if (input.expectedDigest != null && input.observedDigest !== input.expectedDigest) {
    drift.push('DIGEST_MISMATCH');
  }
  const observed = new Set(input.observedFields ?? []);
  for (const field of input.requiredFields ?? []) {
    if (!observed.has(field)) drift.push(`MISSING_FIELD:${field}`);
  }
  if (input.requiresHumanReview) {
    return { status: 'HUMAN_REVIEW', artifactId: input.artifactId, drift, evidenceRefs: [...input.evidenceRefs] };
  }
  return {
    status: drift.length === 0 ? 'PASS' : 'FAIL',
    artifactId: input.artifactId,
    drift,
    evidenceRefs: [...input.evidenceRefs],
  };
}
