import { AsyncLocalStorage } from 'node:async_hooks';
import type { UsageMetadata } from '~/stream/interfaces/IJobStore';

/**
 * Detached subagents outlive the parent turn that launched them. This
 * request-local collector lets the shared SDK usage sink recognize those
 * calls without retaining a request object or changing the SDK task-store
 * contract. AsyncLocalStorage follows the detached executor's promise chain
 * and naturally isolates concurrent child tasks.
 */
const detachedUsageStorage = new AsyncLocalStorage<{ usage: UsageMetadata[]; taskId?: string }>();

export function runWithDetachedSubagentUsage<T>(
  usage: UsageMetadata[],
  run: () => Promise<T>,
  taskId?: string,
): Promise<T> {
  return detachedUsageStorage.run({ usage, ...(taskId ? { taskId } : {}) }, run);
}

/** Records one detached usage item and reports whether a task context owned it. */
export function collectDetachedSubagentUsage(usage: UsageMetadata): boolean {
  const collector = detachedUsageStorage.getStore();
  if (collector == null) {
    return false;
  }
  collector.usage.push(usage);
  return true;
}

/** Native Task Engine identity only within the owning detached execution. */
export function getDetachedSubagentTaskId(): string | undefined {
  return detachedUsageStorage.getStore()?.taskId;
}
