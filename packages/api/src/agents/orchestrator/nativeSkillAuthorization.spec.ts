import type { ImprovementAuthorizationRequest } from './improvementAuthorization';
import { evaluateNativeSkillAuthorization } from './nativeSkillAuthorization';

function updateRequest(): ImprovementAuthorizationRequest {
  return {
    candidateId: 'candidate-skill',
    traceId: 'trace-1',
    target: 'skill',
    operation: 'update',
    actorId: 'user-1',
    skillId: 'skill-1',
    expectedVersion: 7,
    publicationPath: 'native-skill-authoring-required',
    requiresNativeAuthorization: true,
    authorized: false,
    publishable: false,
  };
}

describe('Native skill authorization adapter', () => {
  it('evaluates an update through the host-owned SKILL EDIT permission seam', async () => {
    const checkPermission = jest.fn(async () => true);

    const result = await evaluateNativeSkillAuthorization({
      request: updateRequest(),
      checkPermission,
    });

    expect(checkPermission).toHaveBeenCalledWith({
      actorId: 'user-1',
      resourceType: 'skill',
      resourceId: 'skill-1',
      permission: 'EDIT',
    });
    expect(result).toEqual({
      allowed: true,
      permission: 'EDIT',
      resourceType: 'skill',
      resourceId: 'skill-1',
      actorId: 'user-1',
    });
  });

  it('preserves a native denial without converting it to authority', async () => {
    const result = await evaluateNativeSkillAuthorization({
      request: updateRequest(),
      checkPermission: async () => false,
    });

    expect(result.allowed).toBe(false);
  });

  it('fails closed for create until the native create-policy seam is proven', async () => {
    const request = { ...updateRequest(), operation: 'create' as const };
    delete request.skillId;
    delete request.expectedVersion;

    await expect(
      evaluateNativeSkillAuthorization({
        request,
        checkPermission: async () => true,
      }),
    ).rejects.toThrow('create');
  });

  it('fails closed for incomplete update identity', async () => {
    const request = updateRequest();
    delete request.skillId;

    await expect(
      evaluateNativeSkillAuthorization({
        request,
        checkPermission: async () => true,
      }),
    ).rejects.toThrow();
  });

  it('does not expose a mutation surface', async () => {
    const result = await evaluateNativeSkillAuthorization({
      request: updateRequest(),
      checkPermission: async () => true,
    });

    expect(result).not.toHaveProperty('skill');
    expect(result).not.toHaveProperty('update');
    expect(result).not.toHaveProperty('mutation');
    expect(result).not.toHaveProperty('expectedVersion');
  });
});
