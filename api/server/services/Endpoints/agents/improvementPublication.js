const { authorizeImprovementPublicationForRequest } = require('./improvementAuthorization');
const { getSkillToolDeps } = require('./skillDeps');

/**
 * Applies an already-bounded P10 skill improvement through LibreChat's native
 * updateSkill primitive only after the request-backed native authorization
 * chain declares the update publishable.
 *
 * This function intentionally preserves native updateSkill results
 * (`updated`, `conflict`, `not_found`) and owns no persistence semantics.
 */
async function publishImprovementSkillUpdateForRequest({
  req,
  disposition,
  operation,
  actorId,
  skillId,
  expectedVersion,
  update,
}) {
  if (operation !== 'update') {
    throw new Error('Controlled improvement publication only supports skill updates');
  }

  const authorization = await authorizeImprovementPublicationForRequest({
    req,
    disposition,
    operation,
    actorId,
    skillId,
    expectedVersion,
  });

  if (authorization.authorized !== true || authorization.publishable !== true) {
    throw new Error('Improvement publication is not authorized');
  }

  const { updateSkill } = getSkillToolDeps();
  if (typeof updateSkill !== 'function') {
    throw new Error('Native skill update primitive is unavailable');
  }

  return updateSkill({
    id: authorization.skillId,
    expectedVersion: authorization.expectedVersion,
    update,
  });
}

module.exports = {
  publishImprovementSkillUpdateForRequest,
};
