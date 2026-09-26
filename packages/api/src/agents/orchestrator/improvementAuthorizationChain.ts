import type { NativeSkillPermissionCheck } from './nativeSkillAuthorization';
import type { ImprovementDisposition } from './disposition';
import {
  createImprovementAuthorizationRequest,
  type ImprovementAuthorizationOperation,
} from './improvementAuthorization';
import {
  resolveImprovementAuthorization,
  type ImprovementAuthorizationResult,
} from './improvementAuthorizationResult';
import {
  evaluateNativeSkillUpdatePolicy,
  type NativeSkillCapabilityCheck,
} from './nativeSkillUpdatePolicy';

export interface AuthorizeImprovementPublicationInput {
  disposition: ImprovementDisposition;
  operation: ImprovementAuthorizationOperation;
  actorId: string;
  skillId?: string;
  expectedVersion?: number;
  checkSkillCapability: NativeSkillCapabilityCheck;
  checkPermission: NativeSkillPermissionCheck;
}

/**
 * Composes the bounded improvement authorization stages.
 * This boundary does not own native ACL policy and performs no skill mutation.
 */
export async function authorizeImprovementPublication(
  input: AuthorizeImprovementPublicationInput,
): Promise<ImprovementAuthorizationResult> {
  const request = createImprovementAuthorizationRequest({
    disposition: input.disposition,
    operation: input.operation,
    actorId: input.actorId,
    skillId: input.skillId,
    expectedVersion: input.expectedVersion,
  });

  const nativeAuthorization = await evaluateNativeSkillUpdatePolicy({
    request,
    checkSkillCapability: input.checkSkillCapability,
    checkPermission: input.checkPermission,
  });

  return resolveImprovementAuthorization({
    request,
    nativeAuthorization,
  });
}
