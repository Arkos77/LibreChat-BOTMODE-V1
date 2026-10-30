'use strict';

/**
 * Refuse terminal Oracle approval while a native detached child of the
 * original parent response still has no durable terminal receipt.
 * The start record remains in Mongo after completion; settle by exact
 * task + attempt + thread, not by counting 'running' rows.
 *
 * This is a publication safety gate, not an authorization to replay or
 * resume any child or an automatic recovery implementation.
 */
const MAX_TASK_ROWS = 257;
const statuses = ['running', 'completed', 'error', 'cancelled'];
const projection = 'messageId conversationId +subagentTask';

function refusal(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

async function assertNativeMissionDetachedChildrenTerminal({
  getMessages,
  userId,
  parentResponseMessageId,
  pendingRetryCount = 0,
  pendingRetryDelayMs = 200,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  if (
    typeof getMessages !== 'function' ||
    typeof userId !== 'string' ||
    userId.length === 0 ||
    typeof parentResponseMessageId !== 'string' ||
    parentResponseMessageId.length === 0
  ) {
    throw refusal('NATIVE_MISSION_DETACHED_CHILD_PROOF_UNAVAILABLE');
  }
  // Short, bounded retry for the durable receipt write racing the parent's
  // end-of-model event. Never retry missing, corrupt, failed or cancelled proof.
  // Exceeding the bound still fails closed; this is NOT cold child recovery.
  const retries =
    Number.isSafeInteger(pendingRetryCount) && pendingRetryCount >= 0 && pendingRetryCount <= 30
      ? pendingRetryCount
      : 0;
  for (let retry = 0; retry <= retries; retry++) {
    const rows = await getMessages(
      {
        user: userId,
        'subagentTask.parentRunId': parentResponseMessageId,
        'subagentTask.status': { $in: statuses },
      },
      projection,
      { sort: false, limit: MAX_TASK_ROWS },
    );
    if (!Array.isArray(rows) || rows.length >= MAX_TASK_ROWS) {
      throw refusal('NATIVE_MISSION_DETACHED_CHILD_PROOF_INCOMPLETE');
    }
    const started = new Set();
    const settled = new Set();
    for (const row of rows) {
      const task = row?.subagentTask;
      const messageId = row?.messageId;
      const threadId = row?.conversationId;
      const attempt = task?.attemptKey;
      const status = task?.status;
      if (
        typeof messageId !== 'string' ||
        messageId.length > 270 ||
        typeof threadId !== 'string' ||
        threadId.length === 0 ||
        typeof attempt !== 'string' ||
        attempt.length === 0 ||
        task.parentRunId !== parentResponseMessageId ||
        !statuses.includes(status)
      ) {
        throw refusal('NATIVE_MISSION_DETACHED_CHILD_LINEAGE_UNCERTAIN');
      }
      const running = status === 'running';
      const suffix = running ? ':user' : ':assistant';
      if (!messageId.endsWith(suffix)) {
        throw refusal('NATIVE_MISSION_DETACHED_CHILD_LINEAGE_UNCERTAIN');
      }
      const taskId = messageId.slice(0, -suffix.length);
      if (!taskId || taskId.length > 256) {
        throw refusal('NATIVE_MISSION_DETACHED_CHILD_LINEAGE_UNCERTAIN');
      }
      const key = JSON.stringify([threadId, taskId, attempt]);
      if (running) {
        started.add(key);
      } else {
        if (status !== 'completed') {
          throw refusal('NATIVE_MISSION_DETACHED_CHILD_FAILED');
        }
        settled.add(key);
      }
    }
    // A completed receipt without a matching start is never sufficient proof.
    if ([...settled].some((key) => !started.has(key))) {
      throw refusal('NATIVE_MISSION_DETACHED_CHILD_LINEAGE_UNCERTAIN');
    }
    if ([...started].some((key) => !settled.has(key))) {
      if (retry < retries) {
        await sleep(pendingRetryDelayMs);
        continue;
      }
      throw refusal('NATIVE_MISSION_DETACHED_CHILD_PENDING');
    }
    return;
  }
}

module.exports = { assertNativeMissionDetachedChildrenTerminal };
