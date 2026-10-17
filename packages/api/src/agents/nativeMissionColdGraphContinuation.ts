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
  signal,
}: {
  graph: {
    invoke: (input: null, config: Record<string, unknown>) => Promise<unknown>;
    getState: (config: { configurable: Record<string, string> }) => Promise<unknown>;
  };
  streamId: string;
  checkpointNamespace: string;
  signal: AbortSignal;
}): Promise<void> {
  if (
    !graph ||
    typeof graph.invoke !== 'function' ||
    typeof graph.getState !== 'function' ||
    !streamId ||
    !checkpointNamespace ||
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
  // Never replay with an unchecked graph. The external caller must first
  // match the exact Mongo head to the durable plan via recovery qualification.
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
