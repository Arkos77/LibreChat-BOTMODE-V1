'use strict';

/**
 * Inspect the REAL SDK LangGraph state, never infer the next executable node
 * from Mongo checkpoint metadata alone. In LangGraph, next[] and tasks[]
 * belong to getState(), not the checkpointer's getTuple() contract.
 *
 * This reader is READ ONLY: no graph invoke, tool dispatch or provider call.
 * Its caller must independently authenticate owner, original Mongo mission,
 * model binding, current ACL and live lease before any broker dispatch.
 */
function createNativeMissionOriginalGraphCheckpointReader({ getGraph }) {
  if (typeof getGraph !== 'function') {
    throw new Error('NATIVE_GRAPH_CHECKPOINT_GRAPH_READER_MISSING');
  }
  return async ({ scope, plan, expectedCheckpointId }) => {
    if (
      !scope ||
      typeof scope.streamId !== 'string' || !scope.streamId ||
      typeof scope.checkpointNamespace !== 'string' || !scope.checkpointNamespace ||
      typeof scope.nodeId !== 'string' || !scope.nodeId ||
      typeof scope.taskId !== 'string' || !scope.taskId ||
      typeof scope.agentId !== 'string' || !scope.agentId ||
      !Array.isArray(plan?.tasks) || plan.tasks.length < 2 ||
      (expectedCheckpointId != null &&
        (typeof expectedCheckpointId !== 'string' || !expectedCheckpointId))
    ) throw new Error('NATIVE_GRAPH_CHECKPOINT_ORIGINAL_SCOPE_DENIED');

    const tasks = plan.tasks;
    const selected = tasks.filter((task) =>
      task?.nodeId === scope.nodeId &&
      task?.taskId === scope.taskId &&
      task?.agentId === scope.agentId);
    if (selected.length !== 1 ||
        new Set(tasks.map((task) => task?.nodeId)).size !== tasks.length ||
        tasks.some((task) => typeof task?.key !== 'string' || !task.key ||
          typeof task?.nodeId !== 'string' || !task.nodeId)) {
      throw new Error('NATIVE_GRAPH_CHECKPOINT_NODE_NOT_PLANNED');
    }
    const graph = await getGraph({ scope, plan });
    if (typeof graph?.getState !== 'function') {
      throw new Error('NATIVE_GRAPH_CHECKPOINT_GRAPH_UNAVAILABLE');
    }
    const state = await graph.getState({
      configurable: {
        thread_id: scope.streamId,
        checkpoint_ns: '',
        __librechat_checkpoint_ns: scope.checkpointNamespace,
        __librechat_mission_sync: true,
        ...(expectedCheckpointId && { checkpoint_id: expectedCheckpointId }),
      },
    });
    const config = state?.config?.configurable;
    const node = selected[0];
    if (
      config?.thread_id !== scope.streamId ||
      config?.__librechat_checkpoint_ns !== scope.checkpointNamespace ||
      typeof config?.checkpoint_id !== 'string' ||
      !config.checkpoint_id || config.checkpoint_id.length > 256 ||
      (expectedCheckpointId && config.checkpoint_id !== expectedCheckpointId) ||
      !Array.isArray(state?.next) ||
      state.next.length !== 1 ||
      state.next[0] !== scope.nodeId ||
      !Array.isArray(state?.tasks) ||
      state.tasks.length !== 1 ||
      state.tasks[0]?.name !== scope.nodeId ||
      !Array.isArray(state.tasks[0].interrupts) ||
      state.tasks[0].interrupts.length !== 0 ||
      state.tasks[0].error != null
    ) throw new Error('NATIVE_GRAPH_CHECKPOINT_PENDING_TASK_UNPROVEN');

    const outputs = state?.values?.agentOutputs;
    if (outputs != null && (typeof outputs !== 'object' || Array.isArray(outputs))) {
      throw new Error('NATIVE_GRAPH_CHECKPOINT_OUTPUT_SHAPE_INVALID');
    }
    // A predecessor's output must be present in the original durable state.
    // An in-flight node must NOT already have an output there: the broker
    // supplies its committed provider receipt before LangGraph writes it.
    const keyToNode = new Map(tasks.map((task) => [task.key, task.nodeId]));
    if (
      Object.hasOwn(outputs ?? {}, scope.nodeId) ||
      !Array.isArray(node.dependsOn) ||
      node.dependsOn.some((key) => {
        const predecessor = keyToNode.get(key);
        return !predecessor ||
          !Object.hasOwn(outputs ?? {}, predecessor) ||
          typeof outputs[predecessor]?.content !== 'string' ||
          !outputs[predecessor].content;
      })
    ) throw new Error('NATIVE_GRAPH_CHECKPOINT_DEPENDENCY_UNPROVEN');

    return Object.freeze({
      threadId: scope.streamId,
      checkpointNamespace: scope.checkpointNamespace,
      checkpointId: config.checkpoint_id,
      pendingNodes: Object.freeze([scope.nodeId]),
    });
  };
}

module.exports = { createNativeMissionOriginalGraphCheckpointReader };
