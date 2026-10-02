const {
  createImprovementPayloadDigest,
  inspectSkillContentPolicy,
  verifyImprovementPayloadDigest,
} = require('@librechat/api');
const { authorizeImprovementPublicationForRequest } = require('./improvementAuthorization');
const { getSkillToolDeps } = require('./skillDeps');

/**
 * Applies an already-bounded P10 skill improvement through LibreChat's native
 * updateSkill primitive only after the request-backed native authorization
 * chain declares the exact update payload publishable.
 *
 * This function intentionally preserves native updateSkill results
 * (`updated`, `conflict`, `not_found`) and owns no persistence semantics.
 */
async function publishImprovementSkillCreateForRequest({
  req,
  candidateId,
  payloadDigest,
  skillId,
  create,
}) {
  const allowedFields = new Set([
    'name',
    'displayTitle',
    'description',
    'body',
    'frontmatter',
    'category',
    'alwaysApply',
  ]);
  if (
    create == null ||
    typeof create !== 'object' ||
    Array.isArray(create) ||
    Object.getPrototypeOf(create) !== Object.prototype ||
    Reflect.ownKeys(create).length === 0 ||
    Reflect.ownKeys(create).some((key) => typeof key !== 'string' || !allowedFields.has(key))
  ) {
    throw new Error('Improvement publication skill create fields are invalid');
  }
  if (
    typeof candidateId !== 'string' ||
    candidateId.trim() === '' ||
    candidateId.length > 512 ||
    typeof payloadDigest !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(payloadDigest) ||
    typeof skillId !== 'string' ||
    !/^[a-f0-9]{24}$/i.test(skillId)
  ) {
    throw new Error('Improvement skill create publication identity is invalid');
  }
  if (
    createImprovementPayloadDigest(create) !== payloadDigest ||
    !verifyImprovementPayloadDigest(create, payloadDigest)
  ) {
    throw new Error('Improvement skill create publication payload does not match allocation');
  }

  const { finding, traversalError } = inspectSkillContentPolicy(req?.config?.filters, create);
  if (finding != null || traversalError != null) {
    throw new Error('Improvement publication content policy blocked the skill create');
  }

  const user = req?.user;
  const author = user?._id ?? user?.id;
  if (!user?.id || !author) {
    throw new Error('Improvement skill create publication requires an authenticated owner');
  }

  const { createSkill, grantSkillOwner, hasSkillOwner } = getSkillToolDeps();
  if (
    typeof createSkill !== 'function' ||
    typeof grantSkillOwner !== 'function' ||
    typeof hasSkillOwner !== 'function'
  ) {
    throw new Error('Native skill create publication primitives are unavailable');
  }

  const result = await createSkill(
    {
      ...create,
      author,
      authorName: user.name ?? user.username ?? 'Unknown',
      ...(user.tenantId ? { tenantId: user.tenantId } : {}),
    },
    {
      skillId,
      improvementMutation: {
        operation: 'create',
        candidateId: candidateId.trim(),
        payloadDigest: payloadDigest.toLowerCase(),
      },
    },
  );

  if (result?.skill?._id?.toString?.() !== skillId || result.skill.version !== 1) {
    throw new Error('Native skill create publication identity mismatch');
  }

  await grantSkillOwner({ req, skillId });
  if ((await hasSkillOwner({ req, skillId })) !== true) {
    throw new Error('Native skill create publication owner ACL is not proven');
  }

  return {
    status: 'created',
    skillId,
    skill: result.skill,
    warnings: result.warnings ?? [],
  };
}

async function publishImprovementSkillUpdateForRequest({
  req,
  disposition,
  operation,
  actorId,
  skillId,
  expectedVersion,
  update,
  onAuthorized,
  authorizationObservation,
}) {
  if (operation !== 'update') {
    throw new Error('Controlled improvement publication only supports skill updates');
  }

  const allowedFields = new Set([
    'name',
    'displayTitle',
    'description',
    'body',
    'frontmatter',
    'category',
    'alwaysApply',
  ]);
  if (
    update == null ||
    typeof update !== 'object' ||
    Array.isArray(update) ||
    Object.getPrototypeOf(update) !== Object.prototype ||
    Reflect.ownKeys(update).length === 0 ||
    Reflect.ownKeys(update).some((key) => typeof key !== 'string' || !allowedFields.has(key))
  ) {
    throw new Error('Improvement publication skill update fields are invalid');
  }

  const payloadDigest = createImprovementPayloadDigest(update);
  const authorization = await authorizeImprovementPublicationForRequest({
    req,
    disposition,
    operation,
    actorId,
    skillId,
    expectedVersion,
    payloadDigest,
    authorizationObservation,
  });

  if (
    authorization.candidateId !== disposition?.candidateId ||
    authorization.traceId !== disposition?.traceId ||
    authorization.target !== 'skill' ||
    authorization.operation !== operation ||
    authorization.actorId !== String(actorId) ||
    authorization.skillId !== skillId ||
    authorization.expectedVersion !== expectedVersion ||
    authorization.publicationPath !== 'native-skill-authoring-required'
  ) {
    throw new Error('Improvement publication authorization identity mismatch');
  }

  if (authorization.authorized !== true || authorization.publishable !== true) {
    throw new Error('Improvement publication is not authorized');
  }
  if (
    authorization.payloadDigest !== payloadDigest ||
    !verifyImprovementPayloadDigest(update, authorization.payloadDigest)
  ) {
    throw new Error('Improvement publication payload does not match authorization');
  }

  const { finding, traversalError } = inspectSkillContentPolicy(req?.config?.filters, update);
  if (finding != null || traversalError != null) {
    throw new Error('Improvement publication content policy blocked the skill update');
  }

  if (typeof onAuthorized === 'function') {
    await onAuthorized(authorization);
  }

  const { updateSkill } = getSkillToolDeps();
  if (typeof updateSkill !== 'function') {
    throw new Error('Native skill update primitive is unavailable');
  }

  return updateSkill({
    id: authorization.skillId,
    expectedVersion: authorization.expectedVersion,
    update,
    improvementMutation: {
      candidateId: authorization.candidateId,
      payloadDigest: authorization.payloadDigest,
      expectedVersion: authorization.expectedVersion,
    },
  });
}

module.exports = {
  publishImprovementSkillCreateForRequest,
  publishImprovementSkillUpdateForRequest,
};
