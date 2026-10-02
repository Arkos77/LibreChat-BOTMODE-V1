import type { ImprovementDisposition } from './disposition';
import { createImprovementAuthorizationRequest } from './improvementAuthorization';
import { resolveImprovementAuthorization } from './improvementAuthorizationResult';
import { authorizeImprovementPublication } from './improvementAuthorizationChain';
import { evaluateNativeSkillUpdatePolicy } from './nativeSkillUpdatePolicy';

function acceptedDisposition(): ImprovementDisposition {
  return {
    candidateId: 'candidate-skill',
    traceId: 'trace-1',
    target: 'skill',
    payloadDigest: 'digest-abc',
    oracleDecision: 'ACCEPT',
    disposition: 'AUTHORIZATION_REQUIRED',
    publicationPath: 'native-skill-authoring-required',
    authorized: false,
    publishable: false,
    requiresHumanReview: false,
  };
}

describe('Improvement authorization chain', () => {
  it('composes accepted skill disposition through full native update policy without mutation', async () => {
    const checkSkillCapability = jest.fn(async () => true);
    const checkPermission = jest.fn(async () => true);

    const result = await authorizeImprovementPublication({
      disposition: acceptedDisposition(),
      operation: 'update',
      actorId: 'user-1',
      skillId: 'skill-1',
      expectedVersion: 7,
      payloadDigest: 'digest-abc',
      checkSkillCapability,
      checkPermission,
    });

    expect(checkSkillCapability).toHaveBeenCalledTimes(1);
    expect(checkSkillCapability).toHaveBeenCalledWith({
      actorId: 'user-1',
      permissionType: 'SKILLS',
      permissions: ['USE', 'CREATE'],
    });
    expect(checkPermission).toHaveBeenCalledTimes(1);
    expect(checkPermission).toHaveBeenCalledWith({
      actorId: 'user-1',
      resourceType: 'skill',
      resourceId: 'skill-1',
      permission: 'EDIT',
    });

    expect(result).toEqual({
      candidateId: 'candidate-skill',
      traceId: 'trace-1',
      target: 'skill',
      payloadDigest: 'digest-abc',
      operation: 'update',
      actorId: 'user-1',
      skillId: 'skill-1',
      expectedVersion: 7,
      publicationPath: 'native-skill-authoring-required',
      authorized: true,
      publishable: true,
    });
  });

  it('preserves native resource denial as non-publishable', async () => {
    const result = await authorizeImprovementPublication({
      disposition: acceptedDisposition(),
      operation: 'update',
      actorId: 'user-1',
      skillId: 'skill-1',
      expectedVersion: 7,
      payloadDigest: 'digest-abc',
      checkSkillCapability: async () => true,
      checkPermission: async () => false,
    });

    expect(result.authorized).toBe(false);
    expect(result.publishable).toBe(false);
  });

  it('fails before native authorization for a non-authorizable disposition', async () => {
    const checkSkillCapability = jest.fn(async () => true);
    const checkPermission = jest.fn(async () => true);

    await expect(
      authorizeImprovementPublication({
        disposition: {
          ...acceptedDisposition(),
          disposition: 'PROPOSAL_ONLY',
        },
        operation: 'update',
        actorId: 'user-1',
        skillId: 'skill-1',
        expectedVersion: 7,
        payloadDigest: 'digest-abc',
        checkSkillCapability,
        checkPermission,
      }),
    ).rejects.toThrow();

    expect(checkSkillCapability).not.toHaveBeenCalled();
    expect(checkPermission).not.toHaveBeenCalled();
  });

  it('authorizes create only through the native create capability and exact payload digest', async () => {
    const checkSkillCapability = jest.fn(async () => true);
    const checkPermission = jest.fn(async () => true);

    const result = await authorizeImprovementPublication({
      disposition: acceptedDisposition(),
      operation: 'create',
      actorId: 'user-1',
      payloadDigest: 'digest-abc',
      checkSkillCapability,
      checkPermission,
    });

    expect(checkSkillCapability).toHaveBeenCalledWith({
      actorId: 'user-1',
      permissionType: 'SKILLS',
      permissions: ['USE', 'CREATE'],
    });
    expect(checkPermission).not.toHaveBeenCalled();
    expect(result).toEqual({
      candidateId: 'candidate-skill',
      traceId: 'trace-1',
      target: 'skill',
      payloadDigest: 'digest-abc',
      operation: 'create',
      actorId: 'user-1',
      publicationPath: 'native-skill-authoring-required',
      authorized: true,
      publishable: true,
    });
  });

  it('is only composition of the bounded request, full native update policy, and result resolver', async () => {
    const disposition = acceptedDisposition();
    const request = createImprovementAuthorizationRequest({
      disposition,
      operation: 'update',
      actorId: 'user-1',
      skillId: 'skill-1',
      expectedVersion: 7,
      payloadDigest: 'digest-abc',
    });
    const nativeAuthorization = await evaluateNativeSkillUpdatePolicy({
      request,
      checkSkillCapability: async () => true,
      checkPermission: async () => true,
    });
    const expected = resolveImprovementAuthorization({
      request,
      nativeAuthorization,
    });

    const actual = await authorizeImprovementPublication({
      disposition,
      operation: 'update',
      actorId: 'user-1',
      skillId: 'skill-1',
      expectedVersion: 7,
      payloadDigest: 'digest-abc',
      checkSkillCapability: async () => true,
      checkPermission: async () => true,
    });

    expect(actual).toEqual(expected);
    expect(actual).not.toHaveProperty('skill');
    expect(actual).not.toHaveProperty('body');
    expect(actual).not.toHaveProperty('mutation');
  });

  it('capability denial prevents resource EDIT authorization and publication', async () => {
    const checkSkillCapability = jest.fn(async () => false);
    const checkPermission = jest.fn(async () => true);

    const result = await authorizeImprovementPublication({
      disposition: acceptedDisposition(),
      operation: 'update',
      actorId: 'user-1',
      skillId: 'skill-1',
      expectedVersion: 7,
      payloadDigest: 'digest-abc',
      checkSkillCapability,
      checkPermission,
    });

    expect(checkSkillCapability).toHaveBeenCalledTimes(1);
    expect(checkSkillCapability).toHaveBeenCalledWith({
      actorId: 'user-1',
      permissionType: 'SKILLS',
      permissions: ['USE', 'CREATE'],
    });
    expect(checkPermission).not.toHaveBeenCalled();
    expect(result.authorized).toBe(false);
    expect(result.publishable).toBe(false);
  });
});
