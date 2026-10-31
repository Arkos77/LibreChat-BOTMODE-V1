'use strict';

function deny(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}
const bounded = (s) => typeof s === 'string' && s.length > 0 && s.length <= 256;

/**
 * Read the ACTUAL LangGraph Mongo checkpoint for an original detached child.
 * The SDK graph thread id is not the child's LibreChat conversation id.
 *
 * Fail closed on missing generation namespace, mismatched original parent
 * tool-call lineage, missing persisted checkpoint, or a different task start.
 * This reader cannot dispatch a model effect or create a checkpoint.
 *
 * getCheckpointer must return the same Mongo saver used by the running SDK.
 * assertGenerationNamespace must read its original epoch from a durable,
 * trusted job; neither the model nor the request body chooses that namespace.
 */
function createNativeMissionOriginalChildCheckpointReader({
  getCheckpointer,
  getConvo,
  getStartReceipt,
  assertGenerationNamespace,
}) {
  if (
    [getCheckpointer, getConvo, getStartReceipt, assertGenerationNamespace].some(
      (fn) => typeof fn !== 'function',
    )
  ) {
    deny('NATIVE_ORIGINAL_CHECKPOINT_READER_DEPENDENCIES');
  }
  return async ({
    userId,
    tenantId,
    parentConversationId,
    parentRunId,
    parentToolCallId,
    childThreadId,
    taskId,
    attemptKey,
    agentId,
    provider,
    model,
    graphThreadId,
    checkpointId,
    checkpointNs,
    generationNamespace,
  }) => {
    if (
      [
        userId,
        parentConversationId,
        parentRunId,
        parentToolCallId,
        childThreadId,
        taskId,
        attemptKey,
        agentId,
        provider,
        model,
        graphThreadId,
        checkpointId,
        generationNamespace,
      ].some((value) => !bounded(value)) ||
      (tenantId != null && (typeof tenantId !== 'string' || tenantId.length > 256)) ||
      typeof checkpointNs !== 'string' ||
      checkpointNs.length > 256 ||
      !graphThreadId.startsWith('subagent:')
    ) {
      deny('NATIVE_ORIGINAL_CHECKPOINT_SCOPE_INVALID');
    }
    let address;
    try {
      address = JSON.parse(
        Buffer.from(graphThreadId.slice('subagent:'.length), 'base64url').toString('utf8'),
      );
    } catch {
      deny('NATIVE_ORIGINAL_CHECKPOINT_GRAPH_ADDRESS_INVALID');
    }
    if (
      !Array.isArray(address) ||
      ![5, 6].includes(address.length) ||
      !address.every(bounded) ||
      address[0] !== parentConversationId ||
      address[3] !== parentToolCallId
    ) {
      deny('NATIVE_ORIGINAL_CHECKPOINT_GRAPH_ADDRESS_INVALID');
    }
    const [parent, child, start, namespaceVerified] = await Promise.all([
      getConvo(userId, parentConversationId),
      getConvo(userId, childThreadId),
      getStartReceipt({
        userId,
        tenantId,
        conversationId: childThreadId,
        messageId: taskId + ':user',
      }),
      assertGenerationNamespace({
        userId,
        tenantId,
        parentConversationId,
        parentRunId,
        generationNamespace,
      }),
    ]);
    const lineage = child?.subagentThread;
    if (
      namespaceVerified !== true ||
      parent?.conversationId !== parentConversationId ||
      parent?.subagentThread != null ||
      (parent?.tenantId ?? '') !== (tenantId ?? '') ||
      !bounded(parent?.agent_id) ||
      address[2] !== parent.agent_id ||
      child?.conversationId !== childThreadId ||
      child?.agent_id !== agentId ||
      child?.endpoint !== 'agents' ||
      (child?.tenantId ?? '') !== (tenantId ?? '') ||
      lineage?.parentConversationId !== parentConversationId ||
      lineage?.parentMessageId !== parentRunId ||
      lineage?.parentToolCallId !== parentToolCallId ||
      lineage?.parentAgentId !== parent.agent_id ||
      lineage?.rootConversationId !== parentConversationId ||
      lineage?.subagentKind !== 'agent' ||
      (lineage?.subagentType !== agentId &&
        !(lineage?.subagentType === 'self' && agentId === parent.agent_id)) ||
      start?.conversationId !== childThreadId ||
      start?.messageId !== taskId + ':user' ||
      start?.subagentTask?.status !== 'running' ||
      start?.subagentTask?.attemptKey !== attemptKey ||
      start?.subagentTask?.parentRunId !== parentRunId
    ) {
      deny('NATIVE_ORIGINAL_CHECKPOINT_OWNER_LINEAGE_DENIED');
    }
    const saver = await getCheckpointer();
    if (typeof saver?.getTuple !== 'function') {
      deny('NATIVE_ORIGINAL_CHECKPOINT_SAVER_UNAVAILABLE');
    }
    const tuple = await saver.getTuple({
      configurable: {
        thread_id: graphThreadId,
        checkpoint_id: checkpointId,
        checkpoint_ns: checkpointNs,
        __librechat_checkpoint_ns: generationNamespace,
      },
    });
    if (
      tuple?.checkpoint?.id !== checkpointId ||
      tuple?.config?.configurable?.thread_id !== graphThreadId ||
      tuple?.config?.configurable?.checkpoint_id !== checkpointId ||
      tuple?.config?.configurable?.checkpoint_ns !== checkpointNs ||
      tuple?.config?.configurable?.__librechat_checkpoint_ns !== generationNamespace
    ) {
      deny('NATIVE_ORIGINAL_CHECKPOINT_NOT_DURABLE');
    }
    return Object.freeze({
      graphThreadId,
      checkpointId,
      checkpointNs,
      generationNamespace,
      taskId,
      attemptKey,
      childThreadId,
      provider,
      model,
    });
  };
}
module.exports = { createNativeMissionOriginalChildCheckpointReader };
