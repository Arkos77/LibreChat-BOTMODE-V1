'use strict';

/**
 * Read-only detached child inventory, never authority to replay a provider,
 * effect, model, or publish Oracle/P6. All executor proofs must be separate.
 */
const MAX_ROWS = 257;
const MAX_CHILDREN = 64;
const STATUSES = ['running', 'completed', 'error', 'cancelled'];

function deny(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function boundedId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}

const sameTenant = (actual, expected) => (actual ?? '') === (expected ?? '');

async function inspectNativeMissionDetachedChildColdInventory({
  getMissionOrigin,
  getConvo,
  getMessages,
  userId,
  tenantId,
  parentConversationId,
  parentResponseMessageId,
  parentAgentId,
}) {
  if (
    [getMissionOrigin, getConvo, getMessages].some((fn) => typeof fn !== 'function') ||
    ![userId, parentConversationId, parentResponseMessageId, parentAgentId].every(boundedId) ||
    (tenantId != null && (typeof tenantId !== 'string' || tenantId.length > 256))
  ) {
    deny('NATIVE_CHILD_COLD_INVENTORY_DEPENDENCIES');
  }

  // The original immutable Mongo mission, not the Redis conversation slot,
  // establishes parent identity and original capability classification.
  const origin = await getMissionOrigin({
    userId,
    tenantId,
    conversationId: parentConversationId,
    parentResponseMessageId,
    agentId: parentAgentId,
  });
  if (
    origin?.userId !== userId ||
    !sameTenant(origin?.tenantId, tenantId) ||
    origin?.conversationId !== parentConversationId ||
    origin?.parentResponseMessageId !== parentResponseMessageId ||
    origin?.agentId !== parentAgentId ||
    !boundedId(origin?.planId) ||
    origin?.plan?.planId !== origin.planId ||
    !Array.isArray(origin?.plan?.tasks) ||
    origin.plan.tasks.length === 0 ||
    origin.capabilityAttestation?.mode !== 'receipts_required'
  ) {
    deny('NATIVE_CHILD_COLD_INVENTORY_ORIGIN_UNVERIFIED');
  }

  // Original planned agent IDs are immutable provenance, not live grants.
  // Current ACL, owner fencing and effect receipts must be checked separately.
  const plannedAgentIds = new Set(origin.plan.tasks.map((task) => task?.agentId));
  if (
    plannedAgentIds.has(undefined) ||
    plannedAgentIds.size > 32 ||
    !plannedAgentIds.has(parentAgentId)
  ) {
    deny('NATIVE_CHILD_COLD_INVENTORY_AGENT_PLAN_UNVERIFIED');
  }

  const parent = await getConvo(userId, parentConversationId);
  if (
    parent?.conversationId !== parentConversationId ||
    parent?.agent_id !== parentAgentId ||
    !sameTenant(parent?.tenantId, tenantId) ||
    parent.subagentThread != null
  ) {
    deny('NATIVE_CHILD_COLD_INVENTORY_PARENT_UNVERIFIED');
  }

  const rows = await getMessages(
    {
      user: userId,
      'subagentTask.parentRunId': parentResponseMessageId,
      'subagentTask.status': { $in: STATUSES },
    },
    'messageId conversationId +subagentTask',
    { sort: false, limit: MAX_ROWS },
  );
  if (!Array.isArray(rows) || rows.length === 0 || rows.length >= MAX_ROWS) {
    deny('NATIVE_CHILD_COLD_INVENTORY_INCOMPLETE');
  }

  const entries = new Map();
  const threads = new Set();
  for (const row of rows) {
    const receipt = row?.subagentTask;
    const status = receipt?.status;
    const id = row?.messageId;
    const threadId = row?.conversationId;
    if (
      !boundedId(threadId) ||
      !boundedId(receipt?.attemptKey) ||
      !boundedId(receipt?.parentRunId) ||
      receipt.parentRunId !== parentResponseMessageId ||
      typeof id !== 'string' ||
      id.length > 270 ||
      !STATUSES.includes(status)
    ) {
      deny('NATIVE_CHILD_COLD_INVENTORY_LINEAGE_UNCERTAIN');
    }
    const isStart = status === 'running';
    const suffix = isStart ? ':user' : ':assistant';
    if (!id.endsWith(suffix) || !boundedId(id.slice(0, -suffix.length))) {
      deny('NATIVE_CHILD_COLD_INVENTORY_LINEAGE_UNCERTAIN');
    }
    const taskId = id.slice(0, -suffix.length);
    const key = JSON.stringify([threadId, taskId, receipt.attemptKey]);
    const task = entries.get(key) ?? {
      threadId,
      taskId,
      attemptKey: receipt.attemptKey,
      start: false,
      terminal: null,
    };
    if (isStart) {
      if (task.start) deny('NATIVE_CHILD_COLD_INVENTORY_DUPLICATE');
      task.start = true;
    } else {
      if (task.terminal != null) deny('NATIVE_CHILD_COLD_INVENTORY_DUPLICATE');
      task.terminal = status;
    }
    entries.set(key, task);
    threads.add(threadId);
    if (entries.size > MAX_CHILDREN || threads.size > MAX_CHILDREN) {
      deny('NATIVE_CHILD_COLD_INVENTORY_OVERFLOW');
    }
  }

  for (const threadId of threads) {
    const child = await getConvo(userId, threadId);
    const lineage = child?.subagentThread;
    if (
      child?.conversationId !== threadId ||
      !sameTenant(child?.tenantId, tenantId) ||
      child?.endpoint !== 'agents' ||
      !boundedId(child?.agent_id) ||
      !plannedAgentIds.has(child.agent_id) ||
      lineage?.subagentKind !== 'agent' ||
      (lineage?.subagentType !== child.agent_id &&
        !(lineage?.subagentType === 'self' && child.agent_id === parentAgentId)) ||
      lineage?.parentConversationId !== parentConversationId ||
      lineage?.rootConversationId !== parentConversationId ||
      lineage?.parentMessageId !== parentResponseMessageId ||
      !boundedId(lineage?.parentToolCallId) ||
      (lineage?.parentAgentId != null && lineage.parentAgentId !== parentAgentId)
    ) {
      deny('NATIVE_CHILD_COLD_INVENTORY_THREAD_UNVERIFIED');
    }
  }

  const pending = [];
  let completed = 0;
  for (const task of entries.values()) {
    if (!task.start) deny('NATIVE_CHILD_COLD_INVENTORY_ORPHAN_TERMINAL');
    if (task.terminal === 'error' || task.terminal === 'cancelled') {
      deny('NATIVE_CHILD_COLD_INVENTORY_FAILED_CHILD');
    }
    if (task.terminal === 'completed') {
      completed++;
    } else {
      pending.push(
        Object.freeze({
          threadId: task.threadId,
          taskId: task.taskId,
          attemptKey: task.attemptKey,
          parentRunId: parentResponseMessageId,
        }),
      );
    }
  }

  // Deliberately no 'eligible' flag: independent Redis ownership, fresh ACL,
  // exact attempt and effect receipts remain mandatory before any execution.
  return Object.freeze({
    status: pending.length ? 'blocked_pending_effect_proof' : 'settled',
    executionAuthorized: false,
    parentConversationId,
    parentResponseMessageId,
    completed,
    pending: Object.freeze(pending),
  });
}

module.exports = { inspectNativeMissionDetachedChildColdInventory };
