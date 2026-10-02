import type { NativeSkillAuthorizationEvidence } from './improvementAuthorizationResult';
import type { ImprovementAuthorizationRequest } from './improvementAuthorization';
import {
  evaluateNativeSkillAuthorization,
  type NativeSkillPermissionCheck,
} from './nativeSkillAuthorization';

export interface NativeSkillCapabilityCheckInput {
  actorId: string;
  permissionType: 'SKILLS';
  permissions: ['USE', 'CREATE'];
}

export type NativeSkillCapabilityCheck = (
  input: NativeSkillCapabilityCheckInput,
) => Promise<boolean>;

export async function evaluateNativeSkillUpdatePolicy(input: {
  request: ImprovementAuthorizationRequest;
  checkSkillCapability: NativeSkillCapabilityCheck;
  checkPermission: NativeSkillPermissionCheck;
}): Promise<NativeSkillAuthorizationEvidence> {
  const { request, checkSkillCapability, checkPermission } = input;

  if (!request.actorId) {
    throw new Error('Native skill policy requires actor identity');
  }

  if (
    request.operation === 'update' &&
    (!request.skillId || request.expectedVersion === undefined)
  ) {
    throw new Error('Native skill update policy requires complete update identity');
  }
  if (request.operation === 'create' && !request.payloadDigest) {
    throw new Error('Native skill create policy requires payloadDigest');
  }

  const capabilityAllowed = await checkSkillCapability({
    actorId: request.actorId,
    permissionType: 'SKILLS',
    permissions: ['USE', 'CREATE'],
  });

  if (request.operation === 'create') {
    return {
      allowed: capabilityAllowed === true,
      permission: 'CREATE',
      resourceType: 'skill',
      actorId: request.actorId,
    };
  }

  if (capabilityAllowed !== true) {
    return {
      allowed: false,
      permission: 'EDIT',
      resourceType: 'skill',
      resourceId: request.skillId,
      actorId: request.actorId,
    };
  }

  return evaluateNativeSkillAuthorization({
    request,
    checkPermission,
  });
}
