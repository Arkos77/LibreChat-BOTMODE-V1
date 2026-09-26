import { authorizeImprovementPublication } from './improvementAuthorizationChain';

function acceptedDisposition() {
  return {
    candidateId: 'candidate-skill',
    traceId: 'trace-1',
    target: 'skill' as const,
    payloadDigest: 'digest-abc',
    oracleDecision: 'ACCEPT' as const,
    disposition: 'AUTHORIZATION_REQUIRED' as const,
    publicationPath: 'native-skill-authoring-required' as const,
    authorized: false as const,
    publishable: false as const,
    requiresHumanReview: false,
  };
}

describe('improvement payload digest authorization binding', () => {
  it('preserves the exact payload digest through authorization', async () => {
    const result = await authorizeImprovementPublication({
      disposition: acceptedDisposition(),
      operation: 'update',
      actorId: 'user-1',
      skillId: 'skill-1',
      expectedVersion: 7,
      payloadDigest: 'digest-abc',
      checkSkillCapability: async () => true,
      checkPermission: async () => true,
    } as Parameters<typeof authorizeImprovementPublication>[0] & { payloadDigest: string });

    expect(result).toEqual(
      expect.objectContaining({
        candidateId: 'candidate-skill',
        skillId: 'skill-1',
        expectedVersion: 7,
        payloadDigest: 'digest-abc',
        authorized: true,
        publishable: true,
      }),
    );
  });

  it('fails closed when update authorization has no payload digest', async () => {
    await expect(
      authorizeImprovementPublication({
        disposition: acceptedDisposition(),
        operation: 'update',
        actorId: 'user-1',
        skillId: 'skill-1',
        expectedVersion: 7,
        checkSkillCapability: async () => true,
        checkPermission: async () => true,
      }),
    ).rejects.toThrow(/payload/i);
  });
});
