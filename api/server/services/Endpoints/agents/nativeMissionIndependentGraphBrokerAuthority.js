'use strict';

const HASH = /^[a-f0-9]{64}$/;
const fields = [
  'userId', 'tenantId', 'streamId', 'responseMessageId',
  'checkpointNamespace', 'graphCheckpointId', 'nodeId', 'taskId',
  'agentId', 'provider', 'model',
];
const bounded = (v, empty = false) =>
  typeof v === 'string' && v.length <= 256 && (empty || v.length > 0);

/**
 * Independent authority for a DIRECT native LangGraph node, NOT a detached
 * subagent and NOT the model-only recovery grant.
 *
 * Mongo mission origin is immutable; the checkpoint reader must prove the
 * ACTUAL durable root graph head and pending node. The provider-request
 * verifier must bind the full original canonical request to that checkpoint,
 * not merely accept a user- or API-supplied SHA-256 digest.
 *
 * A successful read is NOT permission to execute. Dispatch additionally
 * requires the exact live original generation lease. No permissive default.
 */
function createNativeMissionIndependentGraphBrokerAuthority({
  getMissionOrigin,
  getConvo,
  authorizeCurrentOwner,
  canViewAgent,
  getCurrentModelBinding,
  readOriginalGraphCheckpoint,
  verifyOriginalModelRequest,
  inspectOriginalGraphLease,
}) {
  if ([
    getMissionOrigin, getConvo, authorizeCurrentOwner, canViewAgent,
    getCurrentModelBinding, readOriginalGraphCheckpoint,
    verifyOriginalModelRequest, inspectOriginalGraphLease,
  ].some((fn) => typeof fn !== 'function')) {
    throw new Error('NATIVE_GRAPH_BROKER_AUTH_DEPENDENCIES_MISSING');
  }
  // Disposable CI diagnostics only. Do not record principal IDs, prompts,
  // request digests, agent bindings or token material.
  const ciActive = () => process.env.BOTMODE_CI_ORIGINAL_BROKER === '1' &&
    process.env.COMPOSE_PROJECT_NAME?.startsWith('botmode-pr107-head-');
  const ciStage = (stage) => {
    if (ciActive()) process.stderr.write('CI_NATIVE_4C_AUTH_STAGE=' + stage + '\n');
  };
  const denyStage = (stage) => {
    if (ciActive()) process.stderr.write('CI_NATIVE_4C_BROKER_AUTH_DENY=' + stage + '\n');
    return false;
  };
  return async ({
    identity, requestDigest, operation,
    authorizedRequest,
  }) => {
    ciStage('ENTER');
    if (
      identity?.mode !== 'native_graph' ||
      fields.some((field) => !bounded(identity[field], field === 'tenantId')) ||
      !Number.isSafeInteger(identity.generationCreatedAt) ||
      identity.generationCreatedAt <= 0 ||
      Object.prototype.hasOwnProperty.call(identity, 'operationKey') ||
      !HASH.test(requestDigest) ||
      !['reserve_native_graph', 'read_native_graph'].includes(operation) ||
      (operation === 'reserve_native_graph' &&
        (authorizedRequest == null || typeof authorizedRequest !== 'object'))
    ) return denyStage('SHAPE');

    const scope = {
      userId: identity.userId,
      tenantId: identity.tenantId,
      conversationId: identity.streamId,
      responseMessageId: identity.responseMessageId,
      createdAt: identity.generationCreatedAt,
      checkpointNamespace: identity.checkpointNamespace,
      checkpointId: identity.graphCheckpointId,
      nodeId: identity.nodeId,
      taskId: identity.taskId,
      agentId: identity.agentId,
      provider: identity.provider,
      model: identity.model,
    };
    ciStage('BEFORE_OWNER');
    if ((await authorizeCurrentOwner(scope)) !== true) return denyStage('OWNER');
    ciStage('BEFORE_CONVERSATION');
    const parent = await getConvo(scope.userId, scope.conversationId);
    if (
      parent?.conversationId !== scope.conversationId ||
      (parent.tenantId ?? '') !== scope.tenantId ||
      parent.subagentThread != null ||
      !bounded(parent.agent_id)
    ) return denyStage('CONVERSATION');
    ciStage('BEFORE_MISSION');
    const [origin, binding, specialistVisible, workerVisible] = await Promise.all([
      getMissionOrigin({
        userId: scope.userId, tenantId: scope.tenantId,
        conversationId: scope.conversationId,
        parentResponseMessageId: scope.responseMessageId,
        agentId: parent.agent_id,
      }),
      getCurrentModelBinding({ agentId: scope.agentId }),
      canViewAgent({ ...scope, agentId: scope.agentId }),
      canViewAgent({ ...scope, agentId: parent.agent_id }),
    ]);
    const tasks = origin?.plan?.tasks;
    if (
      origin?.userId !== scope.userId ||
      (origin.tenantId ?? '') !== scope.tenantId ||
      origin.conversationId !== scope.conversationId ||
      origin.parentResponseMessageId !== scope.responseMessageId ||
      origin.agentId !== parent.agent_id ||
      origin.originalCreatedAt !== scope.createdAt ||
      origin.checkpointNamespace !== scope.checkpointNamespace ||
      !HASH.test(origin.fingerprint) ||
      origin.capabilityAttestation?.mode !== 'receipts_required' ||
      origin.capabilityAttestation?.planId !== origin.planId ||
      origin.plan?.planId !== origin.planId ||
      origin.hasAttachments === true ||
      !Array.isArray(tasks) ||
      tasks.filter((task) =>
        task?.nodeId === scope.nodeId &&
        task?.taskId === scope.taskId &&
        task?.agentId === scope.agentId).length !== 1 ||
      !specialistVisible || !workerVisible ||
      binding?.provider !== scope.provider ||
      binding?.model !== scope.model
    ) return denyStage('MISSION_BINDING');

    ciStage('BEFORE_CHECKPOINT');
    const checkpoint = await readOriginalGraphCheckpoint({
      ...scope, requestDigest, plan: origin.plan,
    });
    if (
      checkpoint?.checkpointId !== scope.checkpointId ||
      checkpoint.threadId !== scope.conversationId ||
      checkpoint.checkpointNamespace !== scope.checkpointNamespace ||
      !Array.isArray(checkpoint.pendingNodes) ||
      !checkpoint.pendingNodes.includes(scope.nodeId) ||
      new Set(checkpoint.pendingNodes).size !== checkpoint.pendingNodes.length ||
      checkpoint.pendingNodes.some((node) =>
        typeof node !== 'string' ||
        !tasks.some((task) => task?.nodeId === node))
    ) return denyStage('CHECKPOINT');

    // In a recovered API we can inspect a committed result without the
    // original live dispatch lease. We must NEVER infer fresh dispatch rights.
    if (operation === 'reserve_native_graph') {
      ciStage('BEFORE_LEASE');
      if ((await inspectOriginalGraphLease({
        ...scope, workerAgentId: parent.agent_id, plan: origin.plan,
      })) !== true) return denyStage('LEASE');
      ciStage('BEFORE_REQUEST');
      if ((await verifyOriginalModelRequest({
        ...scope, requestDigest, authorizedRequest,
      })) !== true) return denyStage('REQUEST');
    }
    return (
      (await authorizeCurrentOwner(scope)) === true &&
      (await canViewAgent({ ...scope, agentId: scope.agentId })) === true &&
      (await canViewAgent({ ...scope, agentId: parent.agent_id })) === true
    );
  };
}

module.exports = { createNativeMissionIndependentGraphBrokerAuthority };
