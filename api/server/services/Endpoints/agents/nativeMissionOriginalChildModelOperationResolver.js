'use strict';

const HASH = /^[a-f0-9]{64}$/;
const STATUS = new Set([
  'prepared',
  'claimed',
  'dispatched',
  'outcome_unknown',
  'result_committed',
]);
const ids = [
  'userId',
  'parentConversationId',
  'parentRunId',
  'parentToolCallId',
  'childThreadId',
  'taskId',
  'attemptKey',
  'agentId',
];

function refuse(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function bounded(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}

function sameTenant(a, b) {
  return (a ?? '') === (b ?? '');
}

/**
 * Resolves an EXISTING, immutable per-model-operation grant for a native
 * detached child. No operations are inserted or inferred. A provider call
 * whose durable identity is missing remains blocked, even if a matching
 * prompt digest or a child start message exists.
 *
 * Host dependencies must load authenticated current ACL/lease from their
 * actual stores and immutable operation records from private MongoDB.
 */
function createNativeMissionOriginalChildModelOperationResolver({
  getMissionOrigin,
  getConvo,
  getStartReceipt,
  findOriginalOperations,
  getOriginalCheckpoint,
  authorizeCurrentOwner,
  canViewAgent,
  inspectOriginalChildOwner,
}) {
  if (
    [
      getMissionOrigin,
      getConvo,
      getStartReceipt,
      findOriginalOperations,
      getOriginalCheckpoint,
      authorizeCurrentOwner,
      canViewAgent,
      inspectOriginalChildOwner,
    ].some((fn) => typeof fn !== 'function')
  ) {
    refuse('NATIVE_MODEL_OPERATION_RESOLVER_DEPENDENCIES');
  }

  return async ({ scope, provider, model, requestDigest }) => {
    if (
      !scope ||
      ids.some((key) => !bounded(scope[key])) ||
      (scope.tenantId != null &&
        (typeof scope.tenantId !== 'string' || scope.tenantId.length > 256)) ||
      !bounded(provider) ||
      !bounded(model) ||
      !HASH.test(requestDigest)
    ) {
      refuse('NATIVE_MODEL_OPERATION_SCOPE_INVALID');
    }
    const tenantId = scope.tenantId ?? '';
    const original = Object.freeze({
      ...Object.fromEntries(ids.map((key) => [key, scope[key]])),
      tenantId,
    });

    // First authenticate present-day owner and agent permissions, not only the
    // immutable historical plan that once authorized a previous execution.
    if (
      (await authorizeCurrentOwner({ userId: original.userId, tenantId })) !== true ||
      (await canViewAgent({
        userId: original.userId,
        tenantId,
        agentId: original.agentId,
      })) !== true ||
      (await inspectOriginalChildOwner(original)) !== true
    ) {
      refuse('NATIVE_MODEL_OPERATION_CURRENT_AUTHORITY_DENIED');
    }

    const parent = await getConvo(original.userId, original.parentConversationId);
    const child = await getConvo(original.userId, original.childThreadId);
    const lineage = child?.subagentThread;
    const parentAgentId = parent?.agent_id;
    if (
      !bounded(parentAgentId) ||
      parent?.conversationId !== original.parentConversationId ||
      !sameTenant(parent?.tenantId, tenantId) ||
      parent.subagentThread != null ||
      child?.conversationId !== original.childThreadId ||
      child?.agent_id !== original.agentId ||
      child?.endpoint !== 'agents' ||
      !sameTenant(child?.tenantId, tenantId) ||
      lineage?.parentConversationId !== original.parentConversationId ||
      lineage?.parentMessageId !== original.parentRunId ||
      lineage?.parentToolCallId !== original.parentToolCallId ||
      lineage?.rootConversationId !== original.parentConversationId ||
      lineage?.parentAgentId !== parentAgentId ||
      lineage?.subagentKind !== 'agent' ||
      (lineage?.subagentType !== original.agentId &&
        !(lineage?.subagentType === 'self' && original.agentId === parentAgentId))
    ) {
      refuse('NATIVE_MODEL_OPERATION_CHILD_LINEAGE_DENIED');
    }
    if (
      (await canViewAgent({ userId: original.userId, tenantId, agentId: parentAgentId })) !== true
    ) {
      refuse('NATIVE_MODEL_OPERATION_PARENT_AUTHORITY_DENIED');
    }

    const origin = await getMissionOrigin({
      userId: original.userId,
      tenantId,
      conversationId: original.parentConversationId,
      parentResponseMessageId: original.parentRunId,
      agentId: parentAgentId,
    });
    if (
      !origin ||
      origin.userId !== original.userId ||
      !sameTenant(origin.tenantId, tenantId) ||
      origin.conversationId !== original.parentConversationId ||
      origin.parentResponseMessageId !== original.parentRunId ||
      origin.agentId !== parentAgentId ||
      !HASH.test(origin.fingerprint) ||
      !bounded(origin.planId) ||
      origin.plan?.planId !== origin.planId ||
      origin.capabilityAttestation?.mode !== 'receipts_required' ||
      !Array.isArray(origin.plan?.tasks) ||
      origin.plan.tasks.length === 0 ||
      !origin.plan.tasks.some((task) => task?.agentId === original.agentId)
    ) {
      refuse('NATIVE_MODEL_OPERATION_ORIGIN_DENIED');
    }

    // The original Task Engine's child start/attempt is required. Neither a
    // stale Redis conversation slot nor a terminal child is execution consent.
    const start = await getStartReceipt({
      userId: original.userId,
      tenantId,
      conversationId: original.childThreadId,
      messageId: original.taskId + ':user',
    });
    if (
      start?.conversationId !== original.childThreadId ||
      start?.messageId !== original.taskId + ':user' ||
      start?.subagentTask?.status !== 'running' ||
      start.subagentTask.parentRunId !== original.parentRunId ||
      start.subagentTask.attemptKey !== original.attemptKey
    ) {
      refuse('NATIVE_MODEL_OPERATION_TASK_ATTEMPT_DENIED');
    }

    // Multiple identical model requests in distinct graph steps are legal.
    // Never choose one by prompt hash or by last-write-wins. The checkpoint
    // identity and original operation key must originate from private Mongo.
    const records = await findOriginalOperations({
      ...original,
      provider,
      model,
      requestDigest,
    });
    if (!Array.isArray(records) || records.length !== 1) {
      refuse('NATIVE_MODEL_OPERATION_PROOF_MISSING_OR_AMBIGUOUS');
    }
    const receipt = records[0];
    if (
      receipt?.userId !== original.userId ||
      !sameTenant(receipt.tenantId, tenantId) ||
      ids.slice(1).some((key) => receipt[key] !== original[key]) ||
      receipt.provider !== provider ||
      receipt.model !== model ||
      receipt.requestDigest !== requestDigest ||
      receipt.originFingerprint !== origin.fingerprint ||
      !HASH.test(receipt.operationKey) ||
      !bounded(receipt.checkpointId) ||
      !STATUS.has(receipt.status)
    ) {
      refuse('NATIVE_MODEL_OPERATION_CHECKPOINT_PROOF_DENIED');
    }
    const checkpoint = await getOriginalCheckpoint({
      ...original,
      checkpointId: receipt.checkpointId,
      provider,
      model,
      ...(typeof receipt.originalSlotKey === 'string'
        ? {
            graphThreadId: receipt.graphThreadId,
            checkpointNs: receipt.checkpointNs,
            generationNamespace: receipt.generationNamespace,
          }
        : {}),
    });
    if (
      checkpoint?.checkpointId !== receipt.checkpointId ||
      checkpoint?.taskId !== original.taskId ||
      checkpoint?.attemptKey !== original.attemptKey ||
      checkpoint?.childThreadId !== original.childThreadId ||
      checkpoint?.provider !== provider ||
      checkpoint?.model !== model ||
      (typeof receipt.originalSlotKey === 'string'
        ? !HASH.test(receipt.originalSlotKey) ||
          !bounded(receipt.graphThreadId) ||
          !receipt.graphThreadId.startsWith('subagent:') ||
          !bounded(receipt.generationNamespace) ||
          typeof receipt.checkpointNs !== 'string' ||
          checkpoint.graphThreadId !== receipt.graphThreadId ||
          checkpoint.generationNamespace !== receipt.generationNamespace ||
          checkpoint.checkpointNs !== receipt.checkpointNs
        : checkpoint?.operationKey !== receipt.operationKey ||
          checkpoint?.requestDigest !== requestDigest)
    ) {
      refuse('NATIVE_MODEL_OPERATION_CHECKPOINT_PROOF_DENIED');
    }

    // Recheck after potentially slow Mongo reads to prevent authorizations
    // issued after an owner/ACL revocation during the lookup.
    if (
      (await inspectOriginalChildOwner(original)) !== true ||
      (await authorizeCurrentOwner({ userId: original.userId, tenantId })) !== true ||
      (await canViewAgent({ userId: original.userId, tenantId, agentId: original.agentId })) !==
        true
    ) {
      refuse('NATIVE_MODEL_OPERATION_AUTHORITY_CHANGED');
    }
    return Object.freeze({
      approved: true,
      scope: Object.freeze({ ...original }),
      provider,
      model,
      requestDigest,
      operationKey: receipt.operationKey,
      checkpointId: receipt.checkpointId,
    });
  };
}

module.exports = { createNativeMissionOriginalChildModelOperationResolver };
