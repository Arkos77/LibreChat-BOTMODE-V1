const { randomUUID } = require('crypto');
const { createAuthorizationRecord, fromAuthorizationRecord } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');

// These version the host check profiles, not mutable ACL entries or role grants.
const CHECK_PROFILES = Object.freeze({
  edit: { capability: 'skill.edit', policyVersion: 'librechat-skill-edit-check-v1' },
  create: { capability: 'skill.create', policyVersion: 'librechat-skill-create-check-v1' },
});

function createObservedSkillCheck({
  req,
  traceId,
  nativeCheck,
  persist,
  sink,
  tenantId,
  profile,
  scope,
}) {
  if (typeof nativeCheck !== 'function') {
    throw new Error('Native skill checker is required');
  }
  return async (input) => {
    const allowed = await nativeCheck(input);
    const actorId = req?.user?.id;
    if (
      input?.req !== req ||
      typeof traceId !== 'string' ||
      traceId.trim() === '' ||
      typeof actorId !== 'string' ||
      actorId.trim() === '' ||
      typeof persist !== 'function'
    ) {
      return allowed;
    }
    try {
      const resolvedScope = scope(input);
      if (resolvedScope == null) return allowed;
      const record = createAuthorizationRecord({
        authorizationId: randomUUID(),
        traceId,
        actorId,
        capability: profile.capability,
        scope: resolvedScope,
        policyVersion: profile.policyVersion,
        decision: allowed === true ? 'ALLOW' : 'DENY',
        timestamp: new Date().toISOString(),
      });
      const event = fromAuthorizationRecord(record, randomUUID());
      await persist({
        user: actorId,
        ...(tenantId == null ? {} : { tenantId }),
        event: {
          traceId: event.identity.traceId,
          traceEventId: event.identity.traceEventId,
          type: event.type,
          source: event.source,
          timestamp: event.timestamp,
          payload: {
            authorizationId: event.payload.authorizationId,
            decision: event.payload.decision,
            capability: event.payload.capability,
            policyVersion: event.payload.policyVersion,
          },
        },
      });
      if (typeof sink === 'function') await sink(event);
    } catch (error) {
      try {
        logger.warn('[BOT MODE P12] Native skill authorization observation failed', {
          name: error?.name,
        });
      } catch (_) {
        // Observation failures cannot affect the native permission outcome.
      }
    }
    return allowed;
  };
}

/** Observes the native resource EDIT ACL result without deciding access. */
function createObservedSkillEditCheck(input) {
  return createObservedSkillCheck({
    ...input,
    profile: CHECK_PROFILES.edit,
    scope: ({ skillId }) =>
      typeof skillId?.toString === 'function' ? `skill:${skillId.toString()}` : null,
  });
}

/** Observes the native SKILLS USE+CREATE role capability result. */
function createObservedSkillCreateCheck(input) {
  return createObservedSkillCheck({
    ...input,
    profile: CHECK_PROFILES.create,
    scope: () => 'skills',
  });
}

module.exports = { createObservedSkillEditCheck, createObservedSkillCreateCheck };
