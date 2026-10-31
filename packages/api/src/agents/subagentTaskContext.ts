import { AsyncLocalStorage } from 'node:async_hooks';
import { getConfig } from '@langchain/langgraph';
import type { UsageMetadata } from '~/stream/interfaces/IJobStore';

/** Host-observed identity for a *running* native detached child. Never a
 * provider-dispatch or replay grant; the actual model operation needs its own
 * immutable key and effect receipt before any network request. */
export type DetachedSubagentExecutionScope = Readonly<{
  userId: string;
  tenantId?: string;
  parentConversationId: string;
  parentRunId: string;
  parentToolCallId: string;
  childThreadId: string;
  taskId: string;
  attemptKey: string;
  agentId: string;
  /** Internal recovery-only continuation: never dispatch a new provider effect. */
  recoveryOnly?: true;
}>;

type DetachedSubagentScopeSeed = Omit<DetachedSubagentExecutionScope, 'taskId'>;

/** Detached executors outlive parent turns. AsyncLocalStorage keeps native
 * task and usage metadata isolated without retaining request objects. */
const detachedUsageStorage = new AsyncLocalStorage<{
  usage: UsageMetadata[];
  taskId?: string;
  producerAgentId?: string;
  executionScope?: DetachedSubagentExecutionScope;
}>();

export function runWithDetachedSubagentUsage<T>(
  usage: UsageMetadata[],
  run: () => Promise<T>,
  taskId?: string,
  executionScope?: DetachedSubagentScopeSeed,
): Promise<T> {
  let originalScope: DetachedSubagentExecutionScope | undefined;
  if (executionScope != null) {
    const fields: (keyof DetachedSubagentExecutionScope)[] = [
      'userId',
      'parentConversationId',
      'parentRunId',
      'parentToolCallId',
      'childThreadId',
      'taskId',
      'attemptKey',
      'agentId',
    ];
    const candidate = { ...executionScope, taskId };
    if (
      fields.some((key) => {
        const value = candidate[key];
        return typeof value !== 'string' || value.length === 0 || value.length > 256;
      }) ||
      (candidate.tenantId != null &&
        (typeof candidate.tenantId !== 'string' || candidate.tenantId.length > 256)) ||
      (candidate.recoveryOnly != null && candidate.recoveryOnly !== true)
    ) {
      throw new Error('NATIVE_DETACHED_PROVIDER_SCOPE_INVALID');
    }
    originalScope = Object.freeze(candidate as DetachedSubagentExecutionScope);
  }
  return detachedUsageStorage.run(
    {
      usage,
      ...(taskId ? { taskId } : {}),
      ...(originalScope == null ? {} : { executionScope: originalScope }),
    },
    run,
  );
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

/** Accept only a host-observed native child start identity in its task context. */
export function setDetachedSubagentProducerAgentId(agentId: string): void {
  const context = detachedUsageStorage.getStore();
  if (context?.taskId && typeof agentId === 'string' && agentId.trim() !== '') {
    context.producerAgentId = agentId.trim();
  }
}

export function getDetachedSubagentProducerAgentId(): string | undefined {
  return detachedUsageStorage.getStore()?.producerAgentId;
}

/** Returns the exact owner context only along its original async task chain.
 * Not an authorization or idempotency key for external provider calls. */
export function getDetachedSubagentExecutionScope(): DetachedSubagentExecutionScope | undefined {
  return detachedUsageStorage.getStore()?.executionScope;
}

/**
 * Read-only ORIGINAL model-step checkpoint coordinates as seen inside the
 * actual LangGraph async execution. A child task's Mongo conversation ID is
 * NOT a LangGraph child graph thread id. Never guess the step checkpoint from
 * the task id, prompt digest or a newer parent checkpoint.
 *
 * This is provenance, NOT provider-dispatch authorization: the authenticated
 * host must still prove this exact persisted checkpoint, original operation
 * admission, owner lease and ACL before authorizing its journal insert.
 */
export function getDetachedSubagentModelCheckpointReference():
  | Readonly<{
      threadId: string;
      checkpointId: string;
      checkpointNs: string;
      generationNamespace: string;
    }>
  | undefined {
  if (getDetachedSubagentExecutionScope() == null) {
    return undefined;
  }
  let config: ReturnType<typeof getConfig>;
  try {
    config = getConfig();
  } catch {
    return undefined;
  }
  const c = config?.configurable;
  const threadId = c?.thread_id;
  const checkpointId = c?.checkpoint_id;
  const checkpointNs = c?.checkpoint_ns;
  const generationNamespace = c?.__librechat_checkpoint_ns;
  if (
    c?.__librechat_mission_sync !== true ||
    typeof threadId !== 'string' ||
    !threadId.startsWith('subagent:') ||
    threadId.length > 256 ||
    typeof checkpointId !== 'string' ||
    !checkpointId ||
    checkpointId.length > 256 ||
    typeof checkpointNs !== 'string' ||
    checkpointNs.length > 256 ||
    typeof generationNamespace !== 'string' ||
    !generationNamespace ||
    generationNamespace.length > 256
  ) {
    return undefined;
  }
  return Object.freeze({ threadId, checkpointId, checkpointNs, generationNamespace });
}
