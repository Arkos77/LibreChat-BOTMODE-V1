const { authorizeImprovementPublication } = require('@librechat/api');
const { getSkillToolDeps } = require('./skillDeps');
const {
  createObservedSkillEditCheck,
  createObservedSkillCreateCheck,
} = require('./skillAuthorizationObservation');

function resolveRequestActorId(req) {
  const actorId = req?.user?.id ?? req?.user?._id?.toString?.();
  if (!actorId) {
    throw new Error('Improvement authorization requires an authenticated request actor');
  }
  return String(actorId);
}

/**
 * Request-backed adapter for the bounded P10 skill-update authorization chain.
 *
 * Native LibreChat authority remains in skillDeps:
 * - canCreateSkill({ req }) -> SKILLS USE + CREATE role capability gate
 * - canEditSkill({ req, skillId }) -> SKILL EDIT resource ACL
 *
 * This adapter performs no skill mutation and deliberately keeps create closed.
 */
async function authorizeImprovementPublicationForRequest({
  req,
  disposition,
  operation,
  actorId,
  skillId,
  expectedVersion,
  payloadDigest,
  authorizationObservation,
}) {
  const requestActorId = resolveRequestActorId(req);
  if (!actorId || String(actorId) !== requestActorId) {
    throw new Error('Improvement authorization actor does not match the authenticated request');
  }
  if (operation !== 'update') {
    throw new Error('Request-backed improvement authorization only supports skill updates');
  }

  const { canCreateSkill, canEditSkill } = getSkillToolDeps();
  if (typeof canCreateSkill !== 'function' || typeof canEditSkill !== 'function') {
    throw new Error('Native skill authorization helpers are unavailable');
  }

  const observation = authorizationObservation ?? {};
  const observedCreate = createObservedSkillCreateCheck({
    req,
    traceId: disposition?.traceId,
    nativeCheck: canCreateSkill,
    persist: observation.persist,
    sink: observation.sink,
    tenantId: observation.tenantId,
  });
  const observedEdit = createObservedSkillEditCheck({
    req,
    traceId: disposition?.traceId,
    nativeCheck: canEditSkill,
    persist: observation.persist,
    sink: observation.sink,
    tenantId: observation.tenantId,
  });

  return authorizeImprovementPublication({
    disposition,
    operation,
    actorId: requestActorId,
    skillId,
    expectedVersion,
    payloadDigest,
    checkSkillCapability: async () => observedCreate({ req }),
    checkPermission: async ({ resourceId }) => observedEdit({ req, skillId: resourceId }),
  });
}

module.exports = {
  authorizeImprovementPublicationForRequest,
};
