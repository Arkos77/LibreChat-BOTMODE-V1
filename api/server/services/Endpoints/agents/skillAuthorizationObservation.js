const { randomUUID } = require('crypto');
const { createAuthorizationRecord, fromAuthorizationRecord } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');

// Versions the host's observation profile, not the mutable ACL entries.
const SKILL_EDIT_OBSERVATION_POLICY_VERSION = 'librechat-skill-edit-check-v1';

/** Observe exactly the outcome of the native skill EDIT check; never decide access. */
function createObservedSkillEditCheck({ req, traceId, nativeCheck, persist, sink, tenantId }) {
  if (typeof nativeCheck !== 'function') {
    throw new Error('Native skill EDIT checker is required');
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
      typeof input.skillId?.toString !== 'function' ||
      typeof persist !== 'function'
    ) {
      return allowed;
    }
    try {
      const authorizationId = randomUUID();
      const record = createAuthorizationRecord({
        authorizationId,
        traceId,
        actorId,
        capability: 'skill.edit',
        scope: `skill:${input.skillId.toString()}`,
        policyVersion: SKILL_EDIT_OBSERVATION_POLICY_VERSION,
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
        logger.warn('[BOT MODE P12] Native skill EDIT observation failed', {
          name: error?.name,
        });
      } catch (_) {
        // Observation failures cannot affect the native ACL outcome.
      }
    }
    return allowed;
  };
}

module.exports = { createObservedSkillEditCheck };
