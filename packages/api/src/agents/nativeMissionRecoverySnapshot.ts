/**
 * Admission gate for a reconstructed SDK graph after a native mission crash.
 * This is a read-only snapshot check, NOT authorization to call tools.
 * Redis ownership, policy, checkpoint generation and publication permissions
 * must be checked separately at the execution and terminal barriers.
 */
export interface NativeMissionPendingCheckpoint {
  checkpointId: string;
  pendingNodes: string[];
}

export interface NativeMissionRecoverySnapshotScope {
  threadId: string;
  /** Node identities derived from the current, durable orchestrator plan. */
  allowedPendingNodes: readonly string[];
}

export function qualifyNativeMissionRecoverySnapshot(
  snapshot: unknown,
  expectedCheckpointId: string,
  scope?: NativeMissionRecoverySnapshotScope,
): NativeMissionPendingCheckpoint | null {
  if (
    typeof expectedCheckpointId !== 'string' ||
    expectedCheckpointId.length === 0 ||
    snapshot == null ||
    typeof snapshot !== 'object'
  ) {
    return null;
  }
  const state = snapshot as Record<string, unknown>;
  const config = state.config;
  if (config == null || typeof config !== 'object') return null;
  const configurable = (config as Record<string, unknown>).configurable;
  if (configurable == null || typeof configurable !== 'object') return null;
  const checkpointId = (configurable as Record<string, unknown>).checkpoint_id;
  if (checkpointId !== expectedCheckpointId) return null;
  if (scope != null) {
    if (
      typeof scope.threadId !== 'string' ||
      scope.threadId.length === 0 ||
      (configurable as Record<string, unknown>).thread_id !== scope.threadId ||
      !Array.isArray(scope.allowedPendingNodes) ||
      scope.allowedPendingNodes.length === 0 ||
      scope.allowedPendingNodes.some((id) => typeof id !== 'string' || id.length === 0) ||
      new Set(scope.allowedPendingNodes).size !== scope.allowedPendingNodes.length
    ) {
      return null;
    }
  }

  const next = state.next;
  const tasks = state.tasks;
  if (!Array.isArray(next) || !Array.isArray(tasks) || next.length === 0) {
    return null;
  }
  const pendingNodes = next as unknown[];
  if (
    pendingNodes.some((name) => typeof name !== 'string' || name.length === 0) ||
    new Set(pendingNodes).size !== pendingNodes.length
  ) {
    return null;
  }

  // An unknown task shape cannot safely be treated as an ordinary in-flight
  // task. In particular, a human approval interrupt is never auto-resumable.
  const runnableTasks = new Set<string>();
  for (const task of tasks as unknown[]) {
    if (task == null || typeof task !== 'object') return null;
    const item = task as Record<string, unknown>;
    if (typeof item.name !== 'string' || item.name.length === 0) return null;
    if (!Array.isArray(item.interrupts) || item.interrupts.length > 0) return null;
    runnableTasks.add(item.name);
  }
  if (!(pendingNodes as string[]).every((name) => runnableTasks.has(name))) return null;
  // A reconstructed but different graph can have the same Mongo head ID.
  // Only original planned task identities may be retried. Refuse internal,
  // unknown, renamed or cross-plan nodes; a separate receipt gate still
  // determines whether any of these original nodes can replay side effects.
  if (scope != null) {
    const allowed = new Set(scope.allowedPendingNodes);
    if (!(pendingNodes as string[]).every((name) => allowed.has(name))) return null;
  }
  return { checkpointId, pendingNodes: pendingNodes as string[] };
}

/** Read a reconstructed graph head without running its nodes. The Mongo
 * checkpoint preflight alone cannot infer LangGraph's pending tasks. */
export async function inspectReconstructedNativeMissionGraph(
  graph: { getState: (config: { configurable: Record<string, string> }) => Promise<unknown> },
  candidate: { streamId: string; checkpointNamespace: string; checkpointId: string },
  plannedNodeIds: readonly string[],
): Promise<NativeMissionPendingCheckpoint | null> {
  if (
    !graph ||
    typeof graph.getState !== 'function' ||
    !candidate ||
    typeof candidate.streamId !== 'string' ||
    !candidate.streamId ||
    typeof candidate.checkpointNamespace !== 'string' ||
    !candidate.checkpointNamespace ||
    typeof candidate.checkpointId !== 'string' ||
    !candidate.checkpointId
  ) {
    return null;
  }
  const snapshot = await graph.getState({
    configurable: {
      thread_id: candidate.streamId,
      checkpoint_ns: '',
      __librechat_checkpoint_ns: candidate.checkpointNamespace,
    },
  });
  return qualifyNativeMissionRecoverySnapshot(snapshot, candidate.checkpointId, {
    threadId: candidate.streamId,
    allowedPendingNodes: plannedNodeIds,
  });
}
