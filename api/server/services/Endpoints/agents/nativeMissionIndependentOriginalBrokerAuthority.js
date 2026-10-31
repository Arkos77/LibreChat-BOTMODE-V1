'use strict';

const { createHash } = require('node:crypto');

const HASH = /^[a-f0-9]{64}$/;
const FIELDS = [
  'userId', 'tenantId', 'parentConversationId', 'parentRunId',
  'childThreadId', 'taskId', 'attemptKey', 'agentId',
  'provider', 'model', 'operationKey',
];
const bounded = (value, empty = false) =>
  typeof value === 'string' && value.length <= 256 && (empty || value.length > 0);
const sha = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/**
 * The independent broker verifies the ORIGINAL Mongo admission, not just the
 * API's HMAC. The operation key, graph slot and mission fingerprint must
 * already be durable. This module is read-only; it never creates provider
 * operations, leases, plans or checkpoints.
 *
 * Status reads after SIGKILL require present-day owner/ACL and the original
 * mission proof, but intentionally do not demand the expired execution lease.
 * A new /execute always requires the CURRENT exclusive child owner lease.
 */
function createNativeMissionIndependentOriginalBrokerAuthority({
  findOriginalOperation,
  getMissionOrigin,
  getConvo,
  getStartReceipt,
  readOriginalCheckpoint,
  authorizeCurrentOwner,
  canViewAgent,
  inspectOriginalChildOwner,
  getCurrentModelBinding,
}) {
  if (
    [findOriginalOperation, getMissionOrigin, getConvo, getStartReceipt,
      readOriginalCheckpoint, authorizeCurrentOwner, canViewAgent,
      inspectOriginalChildOwner, getCurrentModelBinding]
      .some((fn) => typeof fn !== 'function')
  ) {
    throw new Error('NATIVE_BROKER_ORIGINAL_AUTH_DEPENDENCIES');
  }
  return async ({ identity, requestDigest, operation = 'execute' }) => {
    if (
      !identity ||
      FIELDS.some((field) => !bounded(identity[field], field === 'tenantId')) ||
      !HASH.test(identity.operationKey) ||
      !HASH.test(requestDigest) ||
      !['execute', 'read'].includes(operation)
    ) return false;
    const original = Object.fromEntries(FIELDS.map((field) => [field, identity[field]]));
    const scope = {
      userId: original.userId, tenantId: original.tenantId,
      parentConversationId: original.parentConversationId,
      parentRunId: original.parentRunId,
      childThreadId: original.childThreadId,
      taskId: original.taskId,
      attemptKey: original.attemptKey,
      agentId: original.agentId,
    };
    if (!(await authorizeCurrentOwner(scope))) return false;
    const [parent, child, binding, childVisible] = await Promise.all([
      getConvo(original.userId, original.parentConversationId),
      getConvo(original.userId, original.childThreadId),
      getCurrentModelBinding({ agentId: original.agentId }),
      canViewAgent({ ...scope, agentId: original.agentId }),
    ]);
    const lineage = child?.subagentThread;
    if (
      parent?.conversationId !== scope.parentConversationId ||
      parent?.subagentThread != null ||
      child?.conversationId !== scope.childThreadId ||
      child?.endpoint !== 'agents' ||
      child?.agent_id !== scope.agentId ||
      (parent.tenantId ?? '') !== scope.tenantId ||
      (child.tenantId ?? '') !== scope.tenantId ||
      !bounded(parent?.agent_id) ||
      !childVisible ||
      binding?.provider !== original.provider ||
      binding?.model !== original.model ||
      lineage?.parentConversationId !== scope.parentConversationId ||
      lineage?.parentMessageId !== scope.parentRunId ||
      lineage?.parentToolCallId == null ||
      lineage?.parentAgentId !== parent.agent_id ||
      lineage?.rootConversationId !== scope.parentConversationId ||
      lineage?.subagentKind !== 'agent' ||
      (lineage?.subagentType !== scope.agentId &&
        !(lineage?.subagentType === 'self' && scope.agentId === parent.agent_id))
    ) return false;
    if (!(await canViewAgent({ ...scope, agentId: parent.agent_id }))) return false;
    const [origin, start, row] = await Promise.all([
      getMissionOrigin({
        userId: scope.userId, tenantId: scope.tenantId,
        conversationId: scope.parentConversationId,
        parentResponseMessageId: scope.parentRunId, agentId: parent.agent_id,
      }),
      getStartReceipt({
        userId: scope.userId, tenantId: scope.tenantId,
        conversationId: scope.childThreadId, messageId: scope.taskId + ':user',
      }),
      findOriginalOperation({ callKey: sha(original) }),
    ]);
    if (
      origin?.userId !== scope.userId ||
      (origin?.tenantId ?? '') !== scope.tenantId ||
      origin?.conversationId !== scope.parentConversationId ||
      origin?.parentResponseMessageId !== scope.parentRunId ||
      origin?.agentId !== parent.agent_id ||
      origin?.capabilityAttestation?.mode !== 'receipts_required' ||
      !HASH.test(origin?.fingerprint) ||
      !origin?.plan?.tasks?.some((task) => task?.agentId === scope.agentId) ||
      start?.conversationId !== scope.childThreadId ||
      start?.messageId !== scope.taskId + ':user' ||
      start?.subagentTask?.status !== 'running' ||
      start?.subagentTask?.attemptKey !== scope.attemptKey ||
      start?.subagentTask?.parentRunId !== scope.parentRunId ||
      row?.callKey !== sha(original) ||
      JSON.stringify(row.identity) !== JSON.stringify(original) ||
      row.requestDigest !== requestDigest ||
      row.originFingerprint !== origin.fingerprint ||
      row.parentToolCallId !== lineage.parentToolCallId ||
      !HASH.test(row.originalSlotKey) ||
      !bounded(row.checkpointId) ||
      typeof row.graphThreadId !== 'string' ||
      !row.graphThreadId.startsWith('subagent:') ||
      row.graphThreadId.length > 3072 ||
      typeof row.checkpointNs !== 'string' ||
      !bounded(row.generationNamespace) ||
      row.generationNamespace !== origin.checkpointNamespace
    ) return false;
    let address;
    try {
      address = JSON.parse(
        Buffer.from(row.graphThreadId.slice('subagent:'.length), 'base64url').toString('utf8'),
      );
    } catch {
      return false;
    }
    if (
      !Array.isArray(address) ||
      ![5, 6].includes(address.length) ||
      !address.every((value) => bounded(value)) ||
      address[0] !== scope.parentConversationId ||
      address[2] !== parent.agent_id ||
      address[3] !== lineage.parentToolCallId
    ) return false;
    const slot = {
      ...Object.fromEntries(FIELDS.slice(0, -1).map((field) => [field, original[field]])),
      parentToolCallId: lineage.parentToolCallId,
      graphThreadId: row.graphThreadId,
      checkpointId: row.checkpointId,
      checkpointNs: row.checkpointNs,
      generationNamespace: row.generationNamespace,
    };
    if (sha(slot) !== row.originalSlotKey) return false;
    const checkpoint = await readOriginalCheckpoint({
      ...scope,
      parentToolCallId: lineage.parentToolCallId,
      provider: original.provider,
      model: original.model,
      graphThreadId: row.graphThreadId,
      checkpointId: row.checkpointId,
      checkpointNs: row.checkpointNs,
      generationNamespace: row.generationNamespace,
    });
    if (
      checkpoint?.checkpointId !== row.checkpointId ||
      checkpoint?.graphThreadId !== row.graphThreadId ||
      checkpoint?.checkpointNs !== row.checkpointNs ||
      checkpoint?.generationNamespace !== row.generationNamespace ||
      checkpoint?.taskId !== scope.taskId ||
      checkpoint?.attemptKey !== scope.attemptKey ||
      checkpoint?.childThreadId !== scope.childThreadId
    ) return false;
    if (operation === 'execute' && !(await inspectOriginalChildOwner({
      ...scope, parentToolCallId: lineage.parentToolCallId,
    }))) return false;
    return (await authorizeCurrentOwner(scope)) === true &&
      (await canViewAgent({ ...scope, agentId: scope.agentId })) === true &&
      (await canViewAgent({ ...scope, agentId: parent.agent_id })) === true;
  };
}

module.exports = { createNativeMissionIndependentOriginalBrokerAuthority };
