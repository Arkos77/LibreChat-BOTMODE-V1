import type { ImprovementAuthorizationRequest } from './improvementAuthorization';
import { resolveImprovementAuthorization } from './improvementAuthorizationResult';

function request(
  overrides: Partial<ImprovementAuthorizationRequest> = {},
): ImprovementAuthorizationRequest {
  return {
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
    ...overrides,
  };
}

describe('Improvement native authorization result boundary', () => {
  it('marks an update publishable only after explicit native EDIT authorization', () => {
    expect(
      resolveImprovementAuthorization({
        request: request(),
        nativeAuthorization: {
          allowed: true,
          permission: 'EDIT',
          resourceType: 'skill',
          resourceId: 'skill-1',
          actorId: 'user-1',
        },
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
      authorized: true,
      publishable: true,
    });
  });

  it('fails closed when native authorization denies the operation', () => {
    expect(
      resolveImprovementAuthorization({
        request: request(),
        nativeAuthorization: {
          allowed: false,
          permission: 'EDIT',
          resourceType: 'skill',
          resourceId: 'skill-1',
          actorId: 'user-1',
        },
      }),
    ).toMatchObject({ authorized: false, publishable: false });
  });

  it('fails closed when actor identity does not match the authorization request', () => {
    expect(() =>
      resolveImprovementAuthorization({
        request: request(),
        nativeAuthorization: {
          allowed: true,
          permission: 'EDIT',
          resourceType: 'skill',
          resourceId: 'skill-1',
          actorId: 'other-user',
        },
      }),
    ).toThrow();
  });

  it('fails closed when skill identity does not match the update request', () => {
    expect(() =>
      resolveImprovementAuthorization({
        request: request(),
        nativeAuthorization: {
          allowed: true,
          permission: 'EDIT',
          resourceType: 'skill',
          resourceId: 'other-skill',
          actorId: 'user-1',
        },
      }),
    ).toThrow();
  });

  it('fails closed when an update authorization is not EDIT', () => {
    expect(() =>
      resolveImprovementAuthorization({
        request: request(),
        nativeAuthorization: {
          allowed: true,
          permission: 'VIEW',
          resourceType: 'skill',
          resourceId: 'skill-1',
          actorId: 'user-1',
        },
      }),
    ).toThrow();
  });

  it('does not perform or describe a skill mutation', () => {
    const result = resolveImprovementAuthorization({
      request: request(),
      nativeAuthorization: {
        allowed: true,
        permission: 'EDIT',
        resourceType: 'skill',
        resourceId: 'skill-1',
        actorId: 'user-1',
      },
    });

    expect(result).not.toHaveProperty('skill');
    expect(result).not.toHaveProperty('body');
    expect(result).not.toHaveProperty('description');
    expect(result).not.toHaveProperty('mutation');
  });
});
