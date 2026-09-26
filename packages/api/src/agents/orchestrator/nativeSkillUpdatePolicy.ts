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

  if (request.operation !== 'update') {
    throw new Error('Native skill update policy only authorizes update operations');
  }

  if (!request.actorId || !request.skillId || request.expectedVersion === undefined) {
    throw new Error('Native skill update policy requires complete update identity');
  }

  const capabilityAllowed = await checkSkillCapability({
    actorId: request.actorId,
    permissionType: 'SKILLS',
    permissions: ['USE', 'CREATE'],
  });

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
