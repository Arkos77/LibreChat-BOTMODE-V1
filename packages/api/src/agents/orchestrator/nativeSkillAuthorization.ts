import type { NativeSkillAuthorizationEvidence } from './improvementAuthorizationResult';
import type { ImprovementAuthorizationRequest } from './improvementAuthorization';

export interface NativeSkillPermissionCheckInput {
  actorId: string;
  resourceType: 'skill';
  resourceId: string;
  permission: 'EDIT';
}

export type NativeSkillPermissionCheck = (
  input: NativeSkillPermissionCheckInput,
) => Promise<boolean>;

export async function evaluateNativeSkillAuthorization(input: {
  request: ImprovementAuthorizationRequest;
  checkPermission: NativeSkillPermissionCheck;
}): Promise<NativeSkillAuthorizationEvidence> {
  const { request, checkPermission } = input;

  if (
    request.target !== 'skill' ||
    request.publicationPath !== 'native-skill-authoring-required' ||
    request.requiresNativeAuthorization !== true ||
    request.authorized !== false ||
    request.publishable !== false
  ) {
    throw new Error('Invalid improvement authorization request');
  }

  if (request.operation === 'create') {
    throw new Error('Skill create authorization requires the native create-policy seam');
  }

  if (!request.actorId || !request.skillId || request.expectedVersion === undefined) {
    throw new Error('Skill update authorization request is incomplete');
  }

  const allowed = await checkPermission({
    actorId: request.actorId,
    resourceType: 'skill',
    resourceId: request.skillId,
    permission: 'EDIT',
  });

  return {
    allowed: allowed === true,
    permission: 'EDIT',
    resourceType: 'skill',
    resourceId: request.skillId,
    actorId: request.actorId,
  };
}
