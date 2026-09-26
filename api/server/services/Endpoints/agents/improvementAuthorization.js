const { authorizeImprovementPublication } = require('@librechat/api');
const { getSkillToolDeps } = require('./skillDeps');

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

  return authorizeImprovementPublication({
    disposition,
    operation,
    actorId: requestActorId,
    skillId,
    expectedVersion,
    checkSkillCapability: async () => canCreateSkill({ req }),
    checkPermission: async ({ resourceId }) => canEditSkill({ req, skillId: resourceId }),
  });
}

module.exports = {
  authorizeImprovementPublicationForRequest,
};
