const { createHash } = require('crypto');
const { createAuthorizationRecord, fromAuthorizationRecord } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');

const POLICY_VERSION = 'librechat-tool-approval-pause-v1';

function stableId(kind, traceId, actionId) {
  return createHash('sha256').update(`${kind}\0${traceId}\0${actionId}`).digest('hex');
}

/** Records a confirmed native tool approval pause; never grants execution authority. */
async function observeRequiredToolApproval({ userId, tenantId, traceId, action, persist, sink }) {
  if (
    action?.payload?.type !== 'tool_approval' ||
    typeof userId !== 'string' ||
    !userId.trim() ||
    typeof traceId !== 'string' ||
    !traceId.trim() ||
    typeof action.actionId !== 'string' ||
    !action.actionId.trim() ||
    !Number.isFinite(action.createdAt) ||
    typeof persist !== 'function'
  ) {
    return;
  }
  try {
    const record = createAuthorizationRecord({
      authorizationId: stableId('authorization', traceId, action.actionId),
      traceId,
      actorId: userId,
      capability: 'tool.execute',
      scope: `approval:${action.actionId}`,
      policyVersion: POLICY_VERSION,
      decision: 'HUMAN_APPROVAL_REQUIRED',
      humanApproval: { required: true, approvalId: action.actionId },
      timestamp: new Date(action.createdAt).toISOString(),
    });
    const event = fromAuthorizationRecord(record, stableId('event', traceId, action.actionId));
    await persist({
      user: userId,
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
      logger.warn('[BOT MODE P12] Native tool approval observation failed', {
        name: error?.name,
      });
    } catch (_) {
      // Telemetry must not change the native pause result.
    }
  }
}

module.exports = { observeRequiredToolApproval };
