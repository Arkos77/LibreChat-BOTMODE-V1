import type { ImprovementAuthorizationRequest } from './improvementAuthorization';

export interface NativeSkillAuthorizationEvidence {
  allowed: boolean;
  permission: 'VIEW' | 'EDIT';
  resourceType: 'skill';
  resourceId: string;
  actorId: string;
}

export interface ImprovementAuthorizationResult {
  candidateId: string;
  traceId: string;
  target: 'skill';
  operation: 'create' | 'update';
  actorId: string;
  skillId?: string;
  expectedVersion?: number;
  publicationPath: 'native-skill-authoring-required';
  authorized: boolean;
  publishable: boolean;
}

export function resolveImprovementAuthorization(input: {
  request: ImprovementAuthorizationRequest;
  nativeAuthorization: NativeSkillAuthorizationEvidence;
}): ImprovementAuthorizationResult {
  const { request, nativeAuthorization } = input;

  if (
    request.target !== 'skill' ||
    request.publicationPath !== 'native-skill-authoring-required' ||
    request.requiresNativeAuthorization !== true ||
    request.authorized !== false ||
    request.publishable !== false
  ) {
    throw new Error('Invalid improvement authorization request');
  }

  if (nativeAuthorization.resourceType !== 'skill') {
    throw new Error('Native authorization resource type does not match skill publication');
  }

  if (nativeAuthorization.actorId !== request.actorId) {
    throw new Error('Native authorization actor does not match authorization request');
  }

  if (request.operation === 'update') {
    if (!request.skillId || request.expectedVersion === undefined) {
      throw new Error('Skill update authorization request is incomplete');
    }
    if (nativeAuthorization.resourceId !== request.skillId) {
      throw new Error('Native authorization resource does not match skill update request');
    }
    if (nativeAuthorization.permission !== 'EDIT') {
      throw new Error('Skill update requires native EDIT authorization');
    }
  } else {
    throw new Error('Skill create authorization requires the native create-policy seam');
  }

  return {
    candidateId: request.candidateId,
    traceId: request.traceId,
    target: 'skill',
    operation: request.operation,
    actorId: request.actorId,
    skillId: request.skillId,
    expectedVersion: request.expectedVersion,
    publicationPath: 'native-skill-authoring-required',
    authorized: nativeAuthorization.allowed === true,
    publishable: nativeAuthorization.allowed === true,
  };
}
