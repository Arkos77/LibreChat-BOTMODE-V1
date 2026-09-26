const { logger } = require('@librechat/data-schemas');

const IDENTITY_KEYS = Object.freeze([
  'traceId',
  'traceEventId',
  'parentTraceEventId',
  'causedByTraceEventId',
  'taskId',
  'rootRunId',
  'parentRunId',
  'runId',
  'subagentRunId',
  'threadId',
  'agentId',
  'parentAgentId',
  'memberAgentId',
  'parentToolCallId',
]);

const ACTIVITY_PAYLOAD_KEYS = Object.freeze([
  'phase',
  'subagentType',
  'subagentKind',
  'depth',
  'label',
]);
const USAGE_PAYLOAD_KEYS = Object.freeze([
  'usage',
  'model',
  'provider',
  'subagentType',
  'subagentKind',
  'depth',
]);
const ORACLE_PAYLOAD_KEYS = Object.freeze([
  'phase',
  'decision',
  'validator',
  'reasonCodes',
  'uncertainty',
  'checkCount',
  'contradictionCount',
  'evidenceCount',
]);

function pickDefined(source, keys) {
  if (source == null || typeof source !== 'object' || Array.isArray(source)) {
    return undefined;
  }
  const result = {};
  for (const key of keys) {
    if (source[key] !== undefined) {
      result[key] = structuredClone(source[key]);
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function projectMtoObservation(event) {
  if (event == null || typeof event !== 'object' || Array.isArray(event)) {
    return null;
  }
  const identity = pickDefined(event.identity, IDENTITY_KEYS);
  if (
    typeof event.type !== 'string' ||
    typeof event.source !== 'string' ||
    typeof event.timestamp !== 'string' ||
    identity == null ||
    typeof identity.traceId !== 'string' ||
    typeof identity.traceEventId !== 'string' ||
    identity.traceId.trim() === '' ||
    identity.traceEventId.trim() === ''
  ) {
    return null;
  }

  let payload;
  if (event.source === 'subagent-activity') {
    payload = pickDefined(event.payload, ACTIVITY_PAYLOAD_KEYS);
  } else if (event.source === 'subagent-usage') {
    payload = pickDefined(event.payload, USAGE_PAYLOAD_KEYS);
  } else if (event.source === 'oracle') {
    payload = pickDefined(event.payload, ORACLE_PAYLOAD_KEYS);
  }

  return {
    type: event.type,
    source: event.source,
    timestamp: event.timestamp,
    identity,
    ...(payload == null ? {} : { payload }),
  };
}

/**
 * Stateless host sink for already-sanitized MTO observations. It has no domain
 * authority and performs no durable write; logging failures are deliberately
 * contained so observability can never disturb agent execution.
 */
function observeMtoEvent(event) {
  try {
    const observation = projectMtoObservation(event);
    if (observation == null) {
      return;
    }
    logger.debug('[BOT MODE MTO] observation', observation);
  } catch (error) {
    try {
      logger.warn('[BOT MODE MTO] Failed to record observation', error);
    } catch (_) {
      // Observation must never affect execution, even if logging itself fails.
    }
  }
}

module.exports = {
  observeMtoEvent,
  projectMtoObservation,
};
