/**
 * Continue a reconstructed, already-authorized non-HITL LangGraph from its
 * durable head. Never supply a new user message or Command.resume: those
 * would open a different run or fabricate a human decision.
 *
 * This primitive is not a host recovery handler; the caller must enforce
 * Redis ownership, tool receipts, Oracle and publication barriers.
 */
export async function continueColdNativeMissionGraph({
  graph,
  streamId,
  checkpointNamespace,
  expectedCheckpointId,
  plannedNodeIds,
  signal,
}: {
  graph: {
    invoke: (input: null, config: Record<string, unknown>) => Promise<unknown>;
    getState: (config: { configurable: Record<string, string> }) => Promise<unknown>;
  };
  streamId: string;
  checkpointNamespace: string;
  expectedCheckpointId: string;
  plannedNodeIds: readonly string[];
  signal: AbortSignal;
}): Promise<void> {
  if (
    !graph ||
    typeof graph.invoke !== 'function' ||
    typeof graph.getState !== 'function' ||
    !streamId ||
    !checkpointNamespace ||
    !expectedCheckpointId ||
    !Array.isArray(plannedNodeIds) ||
    plannedNodeIds.length === 0 ||
    plannedNodeIds.some((id) => typeof id !== 'string' || !id) ||
    new Set(plannedNodeIds).size !== plannedNodeIds.length ||
    !signal ||
    signal.aborted
  ) {
    throw new Error('NATIVE_MISSION_COLD_CONTINUATION_DENIED');
  }
  const configurable = {
    thread_id: streamId,
    checkpoint_ns: '',
    __librechat_checkpoint_ns: checkpointNamespace,
    nativeMissionEffectFenceRequired: true,
  };
  // Validate the exact graph head *again* immediately before execution. A
  // previous host admission is not enough if another provider moved the head.
  const head = await graph.getState({ configurable });
  if (!head || typeof head !== 'object') throw new Error('NATIVE_MISSION_COLD_HEAD_MISMATCH');
  const saved = head as {
    config?: { configurable?: { checkpoint_id?: string; thread_id?: string } };
    next?: unknown;
    tasks?: unknown;
  };
  const next = saved.next;
  const tasks = saved.tasks;
  const allowed = new Set(plannedNodeIds);
  if (
    saved.config?.configurable?.checkpoint_id !== expectedCheckpointId ||
    saved.config?.configurable?.thread_id !== streamId ||
    !Array.isArray(next) ||
    next.length === 0 ||
    !Array.isArray(tasks) ||
    tasks.length === 0 ||
    next.some((id) => typeof id !== 'string' || !allowed.has(id)) ||
    new Set(next).size !== next.length ||
    tasks.some(
      (task) =>
        !task ||
        typeof task !== 'object' ||
        !allowed.has(task.name) ||
        !Array.isArray(task.interrupts) ||
        task.interrupts.length > 0,
    ) ||
    !next.every((id) => tasks.some((task) => task.name === id))
  ) {
    throw new Error('NATIVE_MISSION_COLD_HEAD_MISMATCH');
  }
  if (signal.aborted) throw new Error('NATIVE_MISSION_COLD_CONTINUATION_ABORTED');
  await graph.invoke(null, { configurable, signal, durability: 'sync' });
  if (signal.aborted) throw new Error('NATIVE_MISSION_COLD_CONTINUATION_ABORTED');
  const state = await graph.getState({ configurable });
  if (
    !state ||
    typeof state !== 'object' ||
    !Array.isArray((state as { next?: unknown }).next) ||
    (state as { next: unknown[] }).next.length !== 0 ||
    !Array.isArray((state as { tasks?: unknown }).tasks) ||
    (state as { tasks: unknown[] }).tasks.length !== 0
  ) {
    throw new Error('NATIVE_MISSION_COLD_CONTINUATION_NOT_TERMINAL');
  }
}
