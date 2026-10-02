import type { ImprovementDisposition } from './disposition';

export type ImprovementAuthorizationOperation = 'create' | 'update';

export interface ImprovementAuthorizationRequest {
  candidateId: string;
  traceId: string;
  target: 'skill';
  operation: ImprovementAuthorizationOperation;
  actorId: string;
  skillId?: string;
  expectedVersion?: number;
  payloadDigest?: string;
  publicationPath: 'native-skill-authoring-required';
  requiresNativeAuthorization: true;
  authorized: false;
  publishable: false;
}

export interface CreateImprovementAuthorizationRequestInput {
  disposition: ImprovementDisposition;
  operation: ImprovementAuthorizationOperation;
  actorId: string;
  skillId?: string;
  expectedVersion?: number;
  payloadDigest?: string;
}

export function createImprovementAuthorizationRequest(
  input: CreateImprovementAuthorizationRequestInput,
): ImprovementAuthorizationRequest {
  const { disposition, operation, actorId, skillId, expectedVersion, payloadDigest } = input;

  if (
    disposition.target !== 'skill' ||
    disposition.disposition !== 'AUTHORIZATION_REQUIRED' ||
    disposition.oracleDecision !== 'ACCEPT' ||
    disposition.publicationPath !== 'native-skill-authoring-required' ||
    disposition.authorized !== false ||
    disposition.publishable !== false
  ) {
    throw new Error('Improvement disposition is not eligible for native skill authorization');
  }

  if (!actorId) {
    throw new Error('Native skill authorization requires an actorId');
  }

  if (operation === 'update') {
    if (!skillId || expectedVersion === undefined || !payloadDigest) {
      throw new Error(
        'Skill update authorization requires skillId, expectedVersion and payloadDigest',
      );
    }
    if (disposition.payloadDigest !== payloadDigest) {
      throw new Error('Skill update payload digest must match the Oracle-verified disposition');
    }

    return {
      candidateId: disposition.candidateId,
      traceId: disposition.traceId,
      target: 'skill',
      operation,
      actorId,
      skillId,
      expectedVersion,
      payloadDigest,
      publicationPath: 'native-skill-authoring-required',
      requiresNativeAuthorization: true,
      authorized: false,
      publishable: false,
    };
  }

  if (skillId !== undefined || expectedVersion !== undefined) {
    throw new Error('Skill create authorization cannot carry skill identity or expectedVersion');
  }
  if (!payloadDigest) {
    throw new Error('Skill create authorization requires payloadDigest');
  }
  if (disposition.payloadDigest !== payloadDigest) {
    throw new Error('Skill create payload digest must match the Oracle-verified disposition');
  }

  return {
    candidateId: disposition.candidateId,
    traceId: disposition.traceId,
    target: 'skill',
    operation,
    actorId,
    payloadDigest,
    publicationPath: 'native-skill-authoring-required',
    requiresNativeAuthorization: true,
    authorized: false,
    publishable: false,
  };
}
