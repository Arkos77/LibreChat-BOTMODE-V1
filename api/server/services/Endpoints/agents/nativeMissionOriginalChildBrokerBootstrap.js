'use strict';
const { ResourceType, PermissionBits } = require('librechat-data-provider');
const {
  createNativeMissionOriginalChildBrokerHost,
} = require('./nativeMissionOriginalChildBrokerHost');
const { getNativeMissionWakeupOrigin } = require('./nativeMissionWakeupOriginStore');

const MAX_BINDINGS = 32;
const safeId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 256;
const denied = (code) => {
  const error = new Error(code);
  error.code = code;
  throw error;
};

/**
 * Explicit startup opt-in. Operator-owned binding catalog, independent broker
 * endpoint and secret are NEVER taken from the HTTP request or mission plan.
 * An invalid opted-in configuration fails startup. No broker, no installation.
 */
function createNativeMissionOriginalChildBrokerBootstrap({
  enabled = false,
  bindingCatalog,
  brokerUrl,
  secret,
  collection,
  getUserById,
  isSubagentOwnerAdmissible,
  getConvo,
  getAgent,
  getMessage,
  listActiveSubagentThreadLeases,
  getCheckpointer,
  getExecutionScope,
  getOriginalCheckpointReference,
  checkPermission,
}) {
  if (enabled !== true) return undefined;
  if (
    !Array.isArray(bindingCatalog) ||
    bindingCatalog.length < 1 ||
    bindingCatalog.length > MAX_BINDINGS ||
    !safeId(brokerUrl) ||
    !safeId(secret) ||
    secret.length < 32 ||
    [
      getUserById,
      isSubagentOwnerAdmissible,
      getConvo,
      getAgent,
      getMessage,
      listActiveSubagentThreadLeases,
      getCheckpointer,
      getExecutionScope,
      getOriginalCheckpointReference,
      checkPermission,
    ].some((fn) => typeof fn !== 'function') ||
    !collection
  )
    denied('NATIVE_ORIGINAL_BROKER_STARTUP_INCOMPLETE');

  let broker;
  try {
    broker = new URL(brokerUrl);
  } catch {
    denied('NATIVE_ORIGINAL_BROKER_ENDPOINT_INVALID');
  }
  if (
    broker.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', 'ci-provider-broker', 'ci-original-provider-broker'].includes(
      broker.hostname,
    ) ||
    !['', '/'].includes(broker.pathname) ||
    broker.username ||
    broker.password ||
    broker.search ||
    broker.hash
  )
    denied('NATIVE_ORIGINAL_BROKER_ENDPOINT_INVALID');
  const catalog = new Map();
  for (const entry of bindingCatalog) {
    if (
      !safeId(entry?.agentId) ||
      !safeId(entry?.model) ||
      !['openai', 'openrouter'].includes(entry?.provider) ||
      typeof entry.endpoint !== 'string' ||
      entry.endpoint.length > 512
    )
      denied('NATIVE_ORIGINAL_BROKER_MODEL_CATALOG_INVALID');
    const key = [entry.agentId, entry.provider, entry.model].join('\0');
    if (catalog.has(key)) denied('NATIVE_ORIGINAL_BROKER_MODEL_CATALOG_DUPLICATE');
    const expected = new URL(entry.endpoint);
    const approvedPath =
      entry.provider === 'openrouter' ? '/api/v1/chat/completions' : '/v1/chat/completions';
    if (
      !['https:', 'http:'].includes(expected.protocol) ||
      !expected.hostname ||
      expected.pathname !== approvedPath ||
      expected.username ||
      expected.password ||
      expected.search ||
      expected.hash
    )
      denied('NATIVE_ORIGINAL_BROKER_MODEL_ENDPOINT_INVALID');
    catalog.set(key, Object.freeze({ ...entry }));
  }
  const resolveModelBinding = ({ agentId, provider, model }) =>
    catalog.get([agentId, provider, model].join('\0'));

  const currentOwner = async ({ userId, tenantId }) => {
    if (!safeId(userId)) return false;
    const [user, admissible] = await Promise.all([
      getUserById(userId),
      isSubagentOwnerAdmissible(userId),
    ]);
    return (
      !!admissible &&
      String(user?._id ?? user?.id ?? '') === userId &&
      (user.tenantId ?? '') === (tenantId ?? '')
    );
  };
  const canViewAgent = async ({ userId, tenantId, agentId }) => {
    if (!safeId(agentId) || !(await currentOwner({ userId, tenantId }))) return false;
    const [agent, user] = await Promise.all([getAgent({ id: agentId }), getUserById(userId)]);
    if (agent?.id !== agentId || agent._id == null || !user) return false;
    return (
      (await checkPermission({
        userId,
        role: user.role,
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        requiredPermission: PermissionBits.VIEW,
      })) === true
    );
  };
  const inspectOriginalChildOwner = async (scope) => {
    if (!(await currentOwner(scope))) return false;
    const leases = await listActiveSubagentThreadLeases({
      user: scope.userId,
      tenantId: scope.tenantId,
      now: new Date(),
    });
    return (
      Array.isArray(leases) &&
      leases.some(
        (lease) =>
          lease?.parentConversationId === scope.parentConversationId &&
          lease?.taskId === scope.taskId &&
          [lease.threadId, lease.childThreadId, lease.childConversationId].includes(
            scope.childThreadId,
          ) &&
          (lease.attemptKey == null || lease.attemptKey === scope.attemptKey),
      )
    );
  };
  const getStartReceipt = ({ userId, messageId }) => getMessage({ user: userId, messageId });
  const authorizeOriginal = async ({
    scope,
    provider,
    model,
    operationKey,
    requestDigest,
    checkpointId,
  }) => {
    if (
      !(await inspectOriginalChildOwner(scope)) ||
      !(await canViewAgent({
        userId: scope.userId,
        tenantId: scope.tenantId,
        agentId: scope.agentId,
      })) ||
      resolveModelBinding({ agentId: scope.agentId, provider, model }) == null
    )
      return { approved: false };
    // Operator bindings are only a transport allowlist. The model/provider
    // must STILL match the agent currently stored by the authenticated host.
    const currentAgent = await getAgent({ id: scope.agentId });
    const savedProvider =
      currentAgent?.provider === 'OpenRouter' ? 'openrouter' : currentAgent?.provider;
    if (savedProvider !== provider || currentAgent?.model !== model) {
      return { approved: false };
    }
    const parent = await getConvo(scope.userId, scope.parentConversationId);
    const origin = await getNativeMissionWakeupOrigin({
      userId: scope.userId,
      tenantId: scope.tenantId,
      conversationId: scope.parentConversationId,
      parentResponseMessageId: scope.parentRunId,
      agentId: parent?.agent_id,
    });
    if (
      origin?.capabilityAttestation?.mode !== 'receipts_required' ||
      origin?.plan?.tasks?.some((task) => task.agentId === scope.agentId) !== true ||
      !/^[a-f0-9]{64}$/.test(origin?.fingerprint ?? '')
    )
      return { approved: false };
    return Object.freeze({
      approved: true,
      scope: { ...scope },
      provider,
      model,
      operationKey,
      requestDigest,
      checkpointId,
      originFingerprint: origin.fingerprint,
    });
  };
  return createNativeMissionOriginalChildBrokerHost({
    collection,
    authorizeOriginal,
    getMissionOrigin: getNativeMissionWakeupOrigin,
    getConvo,
    getStartReceipt,
    getCheckpointer,
    authorizeCurrentOwner: currentOwner,
    canViewAgent,
    inspectOriginalChildOwner,
    getExecutionScope,
    getOriginalCheckpointReference,
    resolveModelBinding,
    brokerUrl,
    secret,
  });
}
module.exports = { createNativeMissionOriginalChildBrokerBootstrap };
