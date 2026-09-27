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

function pickIdentity(source) {
  if (source == null || typeof source !== 'object' || Array.isArray(source)) return undefined;
  const result = {};
  for (const key of IDENTITY_KEYS) {
    const value = source[key];
    if (typeof value === 'string' && value.trim() !== '' && value.length <= 256) {
      result[key] = value;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function projectUsagePayload(source) {
  const selected = pickDefined(source, USAGE_PAYLOAD_KEYS);
  if (selected == null) return undefined;
  const result = {};
  const usage = selected.usage;
  if (usage != null && typeof usage === 'object' && !Array.isArray(usage)) {
    const counters = {};
    for (const key of ['input_tokens', 'output_tokens', 'total_tokens']) {
      if (Number.isSafeInteger(usage[key]) && usage[key] >= 0) counters[key] = usage[key];
    }
    if (Object.keys(counters).length > 0) result.usage = counters;
  }
  for (const key of ['model', 'provider', 'subagentType', 'subagentKind']) {
    if (
      typeof selected[key] === 'string' &&
      selected[key].trim() !== '' &&
      selected[key].length <= 256
    )
      result[key] = selected[key];
  }
  if (Number.isSafeInteger(selected.depth) && selected.depth >= 0 && selected.depth <= 100)
    result.depth = selected.depth;
  return Object.keys(result).length > 0 ? result : undefined;
}

function projectOraclePayload(source) {
  const selected = pickDefined(source, ORACLE_PAYLOAD_KEYS);
  if (selected == null) return undefined;
  const result = {};
  for (const key of ['phase', 'decision']) {
    if (
      typeof selected[key] === 'string' &&
      selected[key].trim() !== '' &&
      selected[key].length <= 256
    )
      result[key] = selected[key];
  }
  const validator = selected.validator;
  if (validator != null && typeof validator === 'object' && !Array.isArray(validator)) {
    const id = boundedHostText(validator.id);
    const type = boundedHostText(validator.type);
    if (id && type) {
      result.validator = { id, type };
      const agentId = boundedHostText(validator.agentId);
      if (agentId) result.validator.agentId = agentId;
    }
  }
  for (const key of ['reasonCodes', 'uncertainty']) {
    if (Array.isArray(selected[key]))
      result[key] = selected[key].filter((value) => boundedHostText(value)).slice(0, 32);
  }
  for (const key of ['checkCount', 'contradictionCount', 'evidenceCount']) {
    if (Number.isSafeInteger(selected[key]) && selected[key] >= 0) result[key] = selected[key];
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function projectActivityPayload(source) {
  const selected = pickDefined(source, ACTIVITY_PAYLOAD_KEYS);
  if (selected == null) return undefined;
  const result = {};
  for (const key of ['phase', 'subagentType', 'subagentKind', 'label']) {
    const value = boundedHostText(selected[key]);
    if (value) result[key] = value;
  }
  if (Number.isSafeInteger(selected.depth) && selected.depth >= 0 && selected.depth <= 100)
    result.depth = selected.depth;
  return Object.keys(result).length > 0 ? result : undefined;
}

function projectMtoObservation(event) {
  if (event == null || typeof event !== 'object' || Array.isArray(event)) {
    return null;
  }
  const identity = pickIdentity(event.identity);
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
    payload = projectActivityPayload(event.payload);
  } else if (event.source === 'subagent-usage') {
    payload = projectUsagePayload(event.payload);
  } else if (event.source === 'oracle') {
    payload = projectOraclePayload(event.payload);
  }

  if (event.source === 'host') payload = projectHostPayload(event);

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

function boundedHostText(value) {
  return typeof value === 'string' && value.trim() !== '' && value.length <= 256
    ? value
    : undefined;
}

function projectHostPayload(event) {
  const input = event.payload;
  if (input == null || typeof input !== 'object' || Array.isArray(input)) return undefined;
  if (event.type === 'DECIDED') {
    const decisionId = boundedHostText(input.decisionId);
    const selectedOption = boundedHostText(input.selectedOption);
    const provider = boundedHostText(input.provider);
    const confidence = input.confidence;
    if (!decisionId || !selectedOption || !provider) return undefined;
    if (
      confidence !== undefined &&
      (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)
    )
      return undefined;
    return {
      decisionId,
      selectedOption,
      provider,
      ...(confidence === undefined ? {} : { confidence }),
    };
  }
  const expectedDecision = {
    AUTHORIZED: 'ALLOW',
    DENIED: 'DENY',
    HUMAN_APPROVAL_REQUIRED: 'HUMAN_APPROVAL_REQUIRED',
  }[event.type];
  if (!expectedDecision) return undefined;
  const authorizationId = boundedHostText(input.authorizationId);
  const capability = boundedHostText(input.capability);
  const policyVersion = boundedHostText(input.policyVersion);
  if (!authorizationId || !capability || !policyVersion || input.decision !== expectedDecision)
    return undefined;
  return { authorizationId, decision: expectedDecision, capability, policyVersion };
}
