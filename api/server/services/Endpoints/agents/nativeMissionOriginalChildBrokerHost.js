'use strict';

const {
  createNativeMissionOriginalChildModelOperationJournal,
} = require('./nativeMissionOriginalChildModelOperationJournal');
const {
  createNativeMissionOriginalChildModelOperationResolver,
} = require('./nativeMissionOriginalChildModelOperationResolver');
const { createNativeMissionOriginalChildCheckpointReader } = require('./nativeMissionOriginalChildCheckpointReader');
const {
  createNativeMissionDetachedBrokerModelFetchFactory,
} = require('./nativeMissionProviderBrokerModelFetch');

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
  getCheckpointer,
  assertGenerationNamespace,
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
  if (typeof getOriginalCheckpointReference !== 'function') {
    deny('NATIVE_ORIGINAL_CHILD_HOST_CHECKPOINT_READER_REQUIRED');
  }
  const checkpointReader =
    readOriginalCheckpoint ??
    createNativeMissionOriginalChildCheckpointReader({
      getCheckpointer,
      getConvo,
      getStartReceipt,
      assertGenerationNamespace,
    });
  if (typeof checkpointReader !== 'function') {
    deny('NATIVE_ORIGINAL_CHILD_HOST_CHECKPOINT_READER_REQUIRED');
  }
  const journal = createNativeMissionOriginalChildModelOperationJournal({
    collection,
    authorizeOriginal,
    readOriginalCheckpoint: checkpointReader,
  });
  const resolveOriginalOperation = createNativeMissionOriginalChildModelOperationResolver({
    getMissionOrigin,
    getConvo,
    getStartReceipt,
    findOriginalOperations: journal.findOriginalOperations,
    getOriginalCheckpoint: checkpointReader,
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
    // LangGraph's original checkpoint proves the durable graph step; its
    // provider operation key does not yet exist until the FIRST reservation.
    // Mongo allocates the opaque key once per original graph step, before
    // any broker/provider effect. A recovered child only reads it.
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
    const saved = await checkpointReader({
      ...scope,
      checkpointId: checkpoint.checkpointId,
      graphThreadId: checkpoint.threadId,
      checkpointNs: checkpoint.checkpointNs,
      generationNamespace: checkpoint.generationNamespace,
      provider,
      model,
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
      saved?.model !== model
    ) {
      deny('NATIVE_ORIGINAL_CHILD_HOST_GRAPH_PROOF_DENIED');
    }
    return journal.reserveOriginal({
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
      },
      parentToolCallId: scope.parentToolCallId,
      graphThreadId: checkpoint.threadId,
      checkpointId: checkpoint.checkpointId,
      checkpointNs: checkpoint.checkpointNs,
      generationNamespace: checkpoint.generationNamespace,
      requestDigest,
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
/**
 * Attach only after request.js has persisted/re-read the exact signed mission
 * admission. The host lives in Express app.locals (trusted server code), not
 * in a user-submitted request body. No host means the original provider path
 * is unchanged; a malformed/partial host is a hard failure, never fallback.
 */
function bindNativeMissionOriginalChildBrokerForAcceptedMission({
  client,
  brokerHost,
  originalPlan,
  capabilityAttestation,
}) {
  if (brokerHost == null || capabilityAttestation?.mode === 'model_only') return false;
  if (
    typeof brokerHost.modelFetchFactory !== 'function' ||
    client?.options == null ||
    client.options.subagentTasks == null ||
    client.options.nativeDetachedModelFetchFactory != null ||
    !Array.isArray(originalPlan?.tasks) ||
    originalPlan.tasks.length < 2 ||
    capabilityAttestation?.mode !== 'receipts_required'
  ) {
    deny('NATIVE_ORIGINAL_CHILD_HOST_ADMISSION_DENIED');
  }
  client.options.nativeDetachedModelFetchFactory = brokerHost.modelFetchFactory;
  return true;
}

module.exports = {
  createNativeMissionOriginalChildBrokerHost,
  bindNativeMissionOriginalChildBrokerForAcceptedMission,
};
