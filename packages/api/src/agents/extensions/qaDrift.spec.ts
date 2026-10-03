import { auditArtifactDrift } from './qaDrift';

describe('QA drift audit', () => {
  it('passes when artifact and required fields match', () => {
    expect(auditArtifactDrift({
      artifactId: 'a1',
      expectedDigest: 'abc',
      observedDigest: 'abc',
      requiredFields: ['title', 'source'],
      observedFields: ['title', 'source'],
      evidenceRefs: ['e1'],
    }).status).toBe('PASS');
  });

  it('reports deterministic drift without becoming a correction authority', () => {
    const result = auditArtifactDrift({
      artifactId: 'a1',
      expectedDigest: 'abc',
      observedDigest: 'def',
      requiredFields: ['source'],
      observedFields: [],
      evidenceRefs: ['e1'],
    });
    expect(result.status).toBe('FAIL');
    expect(result.drift).toEqual(['DIGEST_MISMATCH', 'MISSING_FIELD:source']);
  });

  it('supports explicit human review', () => {
    expect(auditArtifactDrift({ artifactId: 'a1', evidenceRefs: ['e1'], requiresHumanReview: true }).status).toBe(
      'HUMAN_REVIEW',
    );
  });
});
