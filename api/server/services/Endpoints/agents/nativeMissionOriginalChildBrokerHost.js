'use strict';

const {
  createNativeMissionOriginalChildModelOperationJournal,
} = require('./nativeMissionOriginalChildModelOperationJournal');
const {
  createNativeMissionOriginalChildModelOperationResolver,
} = require('./nativeMissionOriginalChildModelOperationResolver');
const {
  createNativeMissionDetachedBrokerModelFetchFactory,
} = require('./nativeMissionProviderBrokerModelFetch');

const HASH = /^[a-f0-9]{64}$/;
function deny(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

/**
 * Production wiring boundary: original LangGraph child checkpoint -> immutable
 * Mongo journal -> independently authorized existing-operation resolver ->
 * native SDK model-fetch seam. The caller must provide LIVE owner/ACL/lease
 * adapters. This module never starts a provider or broker process.
 *
 * Do not register it on every AgentClient: only a host with a real durable
 * checkpoint reader, independent broker and complete original mission grants
 * can opt in. An unproven original operation NEVER falls back to provider I/O.
 */
function createNativeMissionOriginalChildBrokerHost({
  collection,
  authorizeOriginal,
  readOriginalCheckpoint,
  getMissionOrigin,
  getConvo,
  getStartReceipt,
  authorizeCurrentOwner,
  canViewAgent,
  inspectOriginalChildOwner,
  getExecutionScope,
  getOriginalCheckpointReference,
  resolveModelBinding,
  brokerUrl,
  secret,
  fetchImpl,
}) {
  if (
    typeof readOriginalCheckpoint !== 'function' ||
    typeof getOriginalCheckpointReference !== 'function'
  ) {
    deny('NATIVE_ORIGINAL_CHILD_HOST_CHECKPOINT_READER_REQUIRED');
  }
  const journal = createNativeMissionOriginalChildModelOperationJournal({
    collection,
    authorizeOriginal,
    readOriginalCheckpoint,
  });
  const resolveOriginalOperation = createNativeMissionOriginalChildModelOperationResolver({
    getMissionOrigin,
    getConvo,
    getStartReceipt,
    findOriginalOperations: journal.findOriginalOperations,
    getOriginalCheckpoint: readOriginalCheckpoint,
    authorizeCurrentOwner,
    canViewAgent,
    inspectOriginalChildOwner,
  });
  const prepareOriginalOperation = async ({
    scope,
    checkpoint,
    provider,
    model,
    requestDigest,
  }) => {
    // The operation key MUST originate in the ORIGINAL checkpoint and be
    // checked against its exact graph coordinates. Never hash the prompt into
    // a grant or create a fresh key after a process restart.
    if (
      typeof checkpoint?.threadId !== 'string' ||
      !checkpoint.threadId.startsWith('subagent:') ||
      typeof checkpoint.checkpointId !== 'string' ||
      !checkpoint.checkpointId ||
      typeof checkpoint.checkpointNs !== 'string' ||
      typeof checkpoint.generationNamespace !== 'string' ||
      !checkpoint.generationNamespace
    ) {
      deny('NATIVE_ORIGINAL_CHILD_HOST_GRAPH_PROOF_MISSING');
    }
    const saved = await readOriginalCheckpoint({
      ...scope,
      checkpointId: checkpoint.checkpointId,
      graphThreadId: checkpoint.threadId,
      checkpointNs: checkpoint.checkpointNs,
      generationNamespace: checkpoint.generationNamespace,
    });
    if (
      saved?.checkpointId !== checkpoint.checkpointId ||
      saved?.graphThreadId !== checkpoint.threadId ||
      saved?.generationNamespace !== checkpoint.generationNamespace ||
      saved?.checkpointNs !== checkpoint.checkpointNs ||
      saved?.taskId !== scope.taskId ||
      saved?.attemptKey !== scope.attemptKey ||
      saved?.childThreadId !== scope.childThreadId ||
      saved?.provider !== provider ||
      saved?.model !== model ||
      saved?.requestDigest !== requestDigest ||
      !HASH.test(saved?.operationKey)
    ) {
      deny('NATIVE_ORIGINAL_CHILD_HOST_GRAPH_PROOF_DENIED');
    }
    return journal.prepareOriginal({
      identity: {
        userId: scope.userId,
        tenantId: scope.tenantId ?? '',
        parentConversationId: scope.parentConversationId,
        parentRunId: scope.parentRunId,
        childThreadId: scope.childThreadId,
        taskId: scope.taskId,
        attemptKey: scope.attemptKey,
        agentId: scope.agentId,
        provider,
        model,
        operationKey: saved.operationKey,
      },
      parentToolCallId: scope.parentToolCallId,
      requestDigest,
      checkpointId: checkpoint.checkpointId,
    });
  };
  const modelFetchFactory = createNativeMissionDetachedBrokerModelFetchFactory({
    getExecutionScope,
    getOriginalCheckpointReference,
    resolveModelBinding,
    resolveOriginalOperation,
    prepareOriginalOperation,
    brokerUrl,
    secret,
    ...(fetchImpl == null ? {} : { fetchImpl }),
  });
  return Object.freeze({
    modelFetchFactory,
    // Host-side proof is deliberately not exported as a free-standing
    // journal writer; only a live SDK child model call triggers preparation.
  });
}
module.exports = { createNativeMissionOriginalChildBrokerHost };
