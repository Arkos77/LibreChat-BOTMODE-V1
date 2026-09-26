import type { ImprovementAuthorizationRequest } from './improvementAuthorization';
import { evaluateNativeSkillUpdatePolicy } from './nativeSkillUpdatePolicy';

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

describe('Native skill update policy boundary', () => {
  it('requires both the native SKILLS USE+CREATE capability gate and resource EDIT permission', async () => {
    const checkSkillCapability = jest.fn(async () => true);
    const checkPermission = jest.fn(async () => true);

    const result = await evaluateNativeSkillUpdatePolicy({
      request: updateRequest(),
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
    expect(result.allowed).toBe(true);
  });

  it('fails closed before resource ACL when the native capability gate denies', async () => {
    const checkPermission = jest.fn(async () => true);

    const result = await evaluateNativeSkillUpdatePolicy({
      request: updateRequest(),
      checkSkillCapability: async () => false,
      checkPermission,
    });

    expect(result.allowed).toBe(false);
    expect(checkPermission).not.toHaveBeenCalled();
  });

  it('fails closed when resource EDIT denies after capability authorization', async () => {
    const result = await evaluateNativeSkillUpdatePolicy({
      request: updateRequest(),
      checkSkillCapability: async () => true,
      checkPermission: async () => false,
    });

    expect(result.allowed).toBe(false);
  });

  it('keeps create closed because this boundary is update-only', async () => {
    const request = { ...updateRequest(), operation: 'create' as const };
    delete request.skillId;
    delete request.expectedVersion;

    await expect(
      evaluateNativeSkillUpdatePolicy({
        request,
        checkSkillCapability: async () => true,
        checkPermission: async () => true,
      }),
    ).rejects.toThrow('update');
  });

  it('exposes authorization evidence only and no mutation surface', async () => {
    const result = await evaluateNativeSkillUpdatePolicy({
      request: updateRequest(),
      checkSkillCapability: async () => true,
      checkPermission: async () => true,
    });

    expect(result).not.toHaveProperty('skill');
    expect(result).not.toHaveProperty('body');
    expect(result).not.toHaveProperty('mutation');
    expect(result).not.toHaveProperty('update');
  });
});
