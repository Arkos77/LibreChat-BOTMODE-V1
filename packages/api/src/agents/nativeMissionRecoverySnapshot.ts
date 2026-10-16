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

export function qualifyNativeMissionRecoverySnapshot(
  snapshot: unknown,
  expectedCheckpointId: string,
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
  return { checkpointId, pendingNodes: pendingNodes as string[] };
}
