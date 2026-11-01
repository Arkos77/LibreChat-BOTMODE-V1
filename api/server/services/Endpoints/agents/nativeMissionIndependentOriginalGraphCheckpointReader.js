'use strict';

/**
 * Broker-side, read-only cross-check between:
 * 1. Original authenticated SDK graph pending-node proof persisted in Mongo,
 * 2. Independently loaded CURRENT MongoDBSaver root checkpoint head,
 * 3. Original signed sequential plan and completed predecessor output.
 *
 * The broker never assumes getTuple exposes LangGraph's next/tasks list.
 * That list is supplied only by the earlier SDK getState proof recorded
 * before the provider call. Neither API request arguments nor a Redis slot
 * can invent a new pending node or an alternate checkpoint.
 */
function createNativeMissionIndependentOriginalGraphCheckpointReader({
  intentStore, getCheckpointer,
}) {
  if (typeof intentStore?.readProof !== 'function' ||
      typeof getCheckpointer !== 'function') {
    throw new Error('NATIVE_GRAPH_INDEPENDENT_CHECKPOINT_READER_DEPENDENCIES_MISSING');
  }
  return async (scope) => {
    const tasks = scope?.plan?.tasks;
    const target = tasks?.find((task) =>
      task?.nodeId === scope?.nodeId &&
      task?.taskId === scope?.taskId &&
      task?.agentId === scope?.agentId);
    // The initial bridge covers only a two-step sequential model-only
    // ANALYSE after persisted RECHERCHE. Any tool, extra branch, duplicate
    // node or unknown graph topology must remain ineligible.
    if (
      scope == null ||
      typeof scope.conversationId !== 'string' || !scope.conversationId ||
      typeof scope.checkpointNamespace !== 'string' || !scope.checkpointNamespace ||
      typeof scope.checkpointId !== 'string' || !scope.checkpointId ||
      !/^[a-f0-9]{64}$/.test(scope.requestDigest) ||
      !Array.isArray(tasks) || tasks.length !== 2 ||
      scope.plan.strategy !== 'SEQUENTIAL' ||
      !target ||
      target.key !== 'analysis' ||
      !Array.isArray(target.dependsOn) ||
      target.dependsOn.length !== 1 ||
      target.dependsOn[0] !== 'research' ||
      tasks.filter((task) => task.key === 'analysis').length !== 1 ||
      tasks.filter((task) => task.key === 'research').length !== 1 ||
      new Set(tasks.map((task) => task.nodeId)).size !== 2
    ) return null;
    const research = tasks.find((task) => task.key === 'research');
    if (
      research.nodeId === scope.nodeId ||
      !Array.isArray(research.dependsOn) || research.dependsOn.length !== 0
    ) return null;

    const identity = {
      mode: 'native_graph',
      userId: scope.userId, tenantId: scope.tenantId,
      streamId: scope.conversationId,
      responseMessageId: scope.responseMessageId,
      generationCreatedAt: scope.createdAt,
      checkpointNamespace: scope.checkpointNamespace,
      graphCheckpointId: scope.checkpointId,
      nodeId: scope.nodeId, taskId: scope.taskId,
      agentId: scope.agentId, provider: scope.provider, model: scope.model,
    };
    const proof = await intentStore.readProof({
      identity, requestDigest: scope.requestDigest,
    });
    if (
      proof?.threadId !== scope.conversationId ||
      proof?.checkpointNamespace !== scope.checkpointNamespace ||
      proof?.checkpointId !== scope.checkpointId ||
      !Array.isArray(proof.pendingNodes) ||
      proof.pendingNodes.length !== 1 ||
      proof.pendingNodes[0] !== scope.nodeId
    ) return null;

    const saver = await getCheckpointer();
    if (typeof saver?.getTuple !== 'function') return null;
    const tuple = await saver.getTuple({
      configurable: {
        thread_id: scope.conversationId,
        checkpoint_ns: '',
        __librechat_checkpoint_ns: scope.checkpointNamespace,
      },
    });
    // Crucially, getTuple without checkpoint_id asks for the CURRENT head.
    // An old saved graph proof is no longer execution authority.
    if (
      tuple?.checkpoint?.id !== scope.checkpointId ||
      tuple.config?.configurable?.thread_id !== scope.conversationId
    ) return null;
    const outputs = tuple.checkpoint.channel_values?.agentOutputs;
    if (
      outputs == null || typeof outputs !== 'object' ||
      Object.hasOwn(outputs, scope.nodeId) ||
      !Object.hasOwn(outputs, research.nodeId) ||
      typeof outputs[research.nodeId]?.content !== 'string' ||
      !outputs[research.nodeId].content.trim()
    ) return null;
    return Object.freeze({
      checkpointId: scope.checkpointId,
      threadId: scope.conversationId,
      checkpointNamespace: scope.checkpointNamespace,
      pendingNodes: Object.freeze([scope.nodeId]),
    });
  };
}

module.exports = { createNativeMissionIndependentOriginalGraphCheckpointReader };
