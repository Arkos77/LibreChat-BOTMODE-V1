'use strict';
const { ResourceType, PermissionBits } = require('librechat-data-provider');
const { checkPermission } = require('~/server/services/PermissionService');
const {
  createNativeMissionRecoveryHostAuthorization,
} = require('./nativeMissionRecoveryHostAuthorization');
const {
  createNativeMissionAuthorizedClientInitializer,
} = require('./nativeMissionAuthorizedClientInitializer');
const {
  createNativeMissionRecoveryHandlerFactory,
} = require('./nativeMissionRecoveryHandlerFactory');
const {
  createNativeMissionModelOnlyRecoveryCallbacks,
} = require('./nativeMissionModelOnlyRecoveryCallbacks');
const {
  createNativeMissionCheckpointedAnalysisReplay,
} = require('./nativeMissionCheckpointedAnalysisReplay');
const {
  createNativeMissionColdBrokerTransportInstaller,
} = require('./nativeMissionColdBrokerTransportInstaller');
const {
  createNativeMissionColdGraphReceiptProof,
} = require('./nativeMissionColdGraphReceiptProof');

/** Production-only narrow subset of receipts_required: EXACTLY two sequential
 * native nodes, committed Research, sole pending tool-free Analyse with an
 * original broker model receipt. It never grants generic tool-effect replay.
 * All other receipts_required missions remain ineligible and fail closed.
 */
function createNativeMissionReceiptsRequiredRecoveryHandler({
  manager,
  brokerHost,
  getOriginal,
  intentStore,
  providerReceiptStore,
  getUserById,
  isSubagentOwnerAdmissible,
  getConvo,
  getAgent,
  initializeClientFromDocuments,
  createRun,
  validateMissionTask,
  normalizeMissionOracleState,
  areMissionOracleResultsEquivalent,
  qualifyAndExecuteRecoveredMissionSegment,
  continueColdNativeMissionGraph,
  getMessage,
  saveMessage,
  sanitizeMessage,
  emitDone,
  permission = checkPermission,
  log,
}) {
  if (typeof manager?.getJobStore !== 'function' ||
      typeof brokerHost?.makeRecoveryFetchFactoryWithReader !== 'function' ||
      typeof getOriginal !== 'function' ||
      typeof intentStore?.readOriginalIntent !== 'function' ||
      typeof providerReceiptStore?.readOriginalNativeGraph !== 'function' ||
      [
        getUserById, isSubagentOwnerAdmissible, getConvo, getAgent,
        initializeClientFromDocuments, createRun, validateMissionTask,
        normalizeMissionOracleState, areMissionOracleResultsEquivalent,
        qualifyAndExecuteRecoveredMissionSegment, continueColdNativeMissionGraph,
        getMessage, saveMessage, sanitizeMessage, emitDone, permission,
      ].some((callback) => typeof callback !== 'function') ||
      typeof log?.warn !== 'function') {
    throw new Error('NATIVE_RECEIPTS_RECOVERY_HOST_INCOMPLETE');
  }
  const authorizationDeps = {
    getUserById,
    isOwnerAdmissible: isSubagentOwnerAdmissible,
    getConvo,
    getAgent,
    canViewAgent: ({ user, agent }) =>
      permission({
        userId: String(user._id ?? user.id),
        role: user.role,
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        requiredPermission: PermissionBits.VIEW,
      }),
  };
  const authorizeCandidate = createNativeMissionRecoveryHostAuthorization({
    getUserById, isSubagentOwnerAdmissible, getConvo, getAgent, permission,
    resourceType: ResourceType.AGENT, viewPermission: PermissionBits.VIEW,
  });
  const initializeDocuments = createNativeMissionAuthorizedClientInitializer({
    manager, authorizationDeps, initializeClientFromDocuments,
  });
  const replay = createNativeMissionCheckpointedAnalysisReplay({ manager });
  const installer = createNativeMissionColdBrokerTransportInstaller({
    brokerHost, getOriginal,
  });
  const perClient = new WeakMap();
  const initializeAuthorizedClient = async (coordinates) => {
    const initialized = await initializeDocuments(coordinates);
    if (!initialized.client?.options) {
      throw new Error('NATIVE_RECEIPTS_RECOVERY_CLIENT_OPTIONS_MISSING');
    }
    const context = { graph: null, receipt: null, candidate: coordinates.candidate,
      claim: coordinates.claim };
    perClient.set(initialized.client, context);
    // Invoked AFTER graph and original receipt validation by the corrected
    // runtime host. Never equate missing receipts with an empty effect list.
    initialized.client.options.nativeMissionReplayReceiptProof = async (ids) => {
      if (ids.candidate !== context.candidate || ids.claim !== context.claim ||
          context.receipt == null || context.graph == null) {
        throw new Error('NATIVE_RECEIPTS_REPLAY_ORIGINAL_RECEIPT_MISSING');
      }
      await replay.verify({
        client: initialized.client, graph: context.graph,
        candidate: ids.candidate, claim: ids.claim,
        assertAuthorized: coordinates.assertAuthorized,
      });
      await coordinates.assertAuthorized();
      return true;
    };
    return initialized;
  };
  const installRecoveryTransport = async (args) => {
    const state = perClient.get(args.client);
    if (!state || state.graph != null) {
      throw new Error('NATIVE_RECEIPTS_RECOVERY_CLIENT_CONTEXT_MISSING');
    }
    const installed = await installer(args);
    return {
      bindGraph: async (graph) => {
        if ((await installed.bindGraph(graph)) !== true) return false;
        state.graph = graph;
        return true;
      },
    };
  };
  const proveColdGraphReceipt = async ({ client, graph, candidate, claim, assertAuthorized }) => {
    const state = perClient.get(client);
    if (!state || state.graph !== graph || state.receipt != null ||
        state.candidate !== candidate || state.claim !== claim) {
      throw new Error('NATIVE_RECEIPTS_ORIGINAL_GRAPH_CONTEXT_MISMATCH');
    }
    const nodeId = await replay.verify({ client, graph, candidate, claim, assertAuthorized });
    const plan = client.orchestratorPlan;
    const task = plan.tasks.find((item) => item.nodeId === nodeId);
    const agent = client.getReachableMissionAgents().find((item) => item.id === task.agentId);
    const provider = agent?.provider?.toLowerCase();
    const model = agent?.model_parameters?.model ?? agent?.model;
    if (!['openai', 'openrouter'].includes(provider) ||
        typeof model !== 'string' || !model) {
      throw new Error('NATIVE_RECEIPTS_ORIGINAL_MODEL_BINDING_MISSING');
    }
    const job = await manager.getJobStore().getJob(candidate.streamId);
    if (job?.createdAt !== candidate.createdAt ||
        job.orchestratorPlan !== plan &&
          JSON.stringify(job.orchestratorPlan) !== JSON.stringify(plan)) {
      throw new Error('NATIVE_RECEIPTS_ORIGINAL_JOB_CHANGED');
    }
    const identity = {
      mode: 'native_graph',
      userId: job.userId, tenantId: job.tenantId ?? '',
      streamId: candidate.streamId,
      responseMessageId: job.responseMessageId,
      generationCreatedAt: candidate.createdAt,
      checkpointNamespace: candidate.checkpointNamespace,
      graphCheckpointId: candidate.checkpointId,
      nodeId: task.nodeId, taskId: task.taskId,
      agentId: task.agentId, provider, model,
    };
    const proof = createNativeMissionColdGraphReceiptProof({
      intentStore, store: providerReceiptStore, assertAuthorized,
    });
    const receipt = await proof({ candidate, claim, identity, pendingNodes: [nodeId] });
    await assertAuthorized();
    state.receipt = receipt;
    return true;
  };
  const callbacks = createNativeMissionModelOnlyRecoveryCallbacks({
    manager, validateMissionTask,
    normalizeOracleState: normalizeMissionOracleState,
    areMissionOracleResultsEquivalent,
    getConversation: getConvo, getMessage, saveMessage, sanitizeMessage, emitDone,
  });
  return createNativeMissionRecoveryHandlerFactory({
    manager, authorizeCandidate, initializeAuthorizedClient,
    normalizeOracleState: normalizeMissionOracleState,
    createRun,
    replaySafety: replay.replaySafety,
    effectFences: replay.effectFences,
    oracle: callbacks.oracle,
    publication: callbacks.publication,
    installRecoveryTransport,
    proveColdGraphReceipt,
    qualifyAndExecuteRecoveredMissionSegment,
    continueColdNativeMissionGraph,
    log,
  });
}

module.exports = { createNativeMissionReceiptsRequiredRecoveryHandler };
