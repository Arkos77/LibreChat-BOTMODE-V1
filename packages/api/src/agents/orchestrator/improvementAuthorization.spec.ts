import type { ImprovementDisposition } from './disposition';
import { createImprovementAuthorizationRequest } from './improvementAuthorization';

function disposition(overrides: Partial<ImprovementDisposition> = {}): ImprovementDisposition {
  return {
    candidateId: 'candidate-skill',
    traceId: 'trace-1',
    target: 'skill',
    oracleDecision: 'ACCEPT',
    disposition: 'AUTHORIZATION_REQUIRED',
    publicationPath: 'native-skill-authoring-required',
    authorized: false,
    publishable: false,
    requiresHumanReview: false,
    ...overrides,
  };
}

describe('Improvement authorization boundary', () => {
  it('creates a bounded native skill authorization request from an accepted skill disposition', () => {
    expect(
      createImprovementAuthorizationRequest({
        disposition: disposition(),
        operation: 'update',
        actorId: 'user-1',
        skillId: 'skill-1',
        expectedVersion: 7,
        payloadDigest: 'digest-abc',
      }),
    ).toEqual({
      candidateId: 'candidate-skill',
      traceId: 'trace-1',
      target: 'skill',
      operation: 'update',
      actorId: 'user-1',
      skillId: 'skill-1',
      expectedVersion: 7,
      payloadDigest: 'digest-abc',
      publicationPath: 'native-skill-authoring-required',
      requiresNativeAuthorization: true,
      authorized: false,
      publishable: false,
    });
  });

  it.each(['PROPOSAL_ONLY', 'REJECTED', 'DEFERRED', 'HUMAN_REVIEW_REQUIRED'] as const)(
    'fails closed for %s disposition',
    (status) => {
      expect(() =>
        createImprovementAuthorizationRequest({
          disposition: disposition({ disposition: status }),
          operation: 'create',
          actorId: 'user-1',
        }),
      ).toThrow();
    },
  );

  it('fails closed when Oracle did not ACCEPT', () => {
    expect(() =>
      createImprovementAuthorizationRequest({
        disposition: disposition({ oracleDecision: 'REJECT' }),
        operation: 'create',
        actorId: 'user-1',
      }),
    ).toThrow();
  });

  it('requires skill identity and expectedVersion for update', () => {
    expect(() =>
      createImprovementAuthorizationRequest({
        disposition: disposition(),
        operation: 'update',
        actorId: 'user-1',
      }),
    ).toThrow();
  });

  it('does not accept an expectedVersion for create', () => {
    expect(() =>
      createImprovementAuthorizationRequest({
        disposition: disposition(),
        operation: 'create',
        actorId: 'user-1',
        expectedVersion: 1,
      }),
    ).toThrow();
  });

  it('does not grant authorization or publication authority', () => {
    const result = createImprovementAuthorizationRequest({
      disposition: disposition(),
      operation: 'create',
      actorId: 'user-1',
    });

    expect(result.authorized).toBe(false);
    expect(result.publishable).toBe(false);
    expect(result).not.toHaveProperty('permissionGranted');
    expect(result).not.toHaveProperty('authorization');
  });
});
