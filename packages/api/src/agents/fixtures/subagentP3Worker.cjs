'use strict';

const fs = require('node:fs');
const mongoose = require('mongoose');
const { createMethods, createModels } = require('@librechat/data-schemas');
const {
  SubagentThreadTaskStore,
  buildSubagentThreadTaskConfig,
  hasDurableSubagentRecoveryCheckpoint,
} = require('@librechat/api');

function send(message) {
  if (typeof process.send === 'function') process.send({ pid: process.pid, ...message });
}

async function main() {
  const {
    P3_ROLE: role,
    P3_MONGO_URI: mongoUri,
    P3_USER_ID: userId,
    P3_TENANT_ID: tenantId,
    P3_PARENT_CONVERSATION_ID: parentConversationId,
    P3_IDEMPOTENCY_KEY: idempotencyKey,
    P3_EFFECT_FILE: effectFile,
    P3_CHECKPOINT_NAMESPACE: checkpointNamespace,
  } = process.env;
  if (!role || !mongoUri || !userId || !tenantId || !parentConversationId || !idempotencyKey || !effectFile || !checkpointNamespace) {
    throw new Error('Missing P3 worker environment.');
  }

  createModels(mongoose);
  const methods = createMethods(mongoose);
  await mongoose.connect(mongoUri, { autoIndex: false });

  const store = new SubagentThreadTaskStore(methods, {
    leaseTtlMs: 500,
    leaseHeartbeatMs: 100,
  });
  const config = buildSubagentThreadTaskConfig(
    store,
    { userId, tenantId, parentConversationId },
    role === 'B'
      ? {
          completionWakeups: false,
          verifyDurableRecovery: async (candidate) => {
            const verified = await hasDurableSubagentRecoveryCheckpoint(
              candidate.parentConversationId,
              { type: 'mongo', ttl: 3600 },
              {
                checkpointNamespace,
                parentToolCallId: candidate.parentToolCallId,
                childThreadId: candidate.childThreadId,
              },
            );
            send({ type: 'verification', candidate, verified });
            return verified;
          },
        }
      : { completionWakeups: false },
  );

  const request = {
    scopeId: config.scopeId,
    idempotencyKey,
    parentRunId: role === 'A' ? 'parent-run' : 'retry-run-must-not-authorize-recovery',
    parentAgentId: 'agent_parent',
    parentToolCallId: role === 'A' ? 'parent-tool' : 'retry-tool-must-not-authorize-recovery',
    requestFingerprint: 'same-inputs',
    input: 'P3 multiprocess recovery proof',
    subagentKind: 'agent',
    subagentType: 'researcher',
    run: async (runtime) => {
      send({
        type: 'entered',
        role,
        taskId: runtime.taskId,
        recoveryOnly: runtime.recoveryOnly === true,
      });

      if (role === 'A') await new Promise(() => {});

      if (runtime.recoveryOnly !== true) {
        throw new Error('Worker B was not fenced into recovery-only execution.');
      }
      fs.appendFileSync(effectFile, `effect:${process.pid}:${runtime.taskId}\n`, 'utf8');
      return { content: 'Recovered exactly once.' };
    },
  };

  const started = config.store.start(request);
  if (!started.accepted) {
    send({ type: 'rejected', role, reason: started.reason });
    process.exitCode = 2;
    return;
  }
  send({
    type: 'accepted',
    role,
    taskId: started.task.taskId,
    threadId: started.task.threadId,
    isNew: started.isNew,
  });

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const task = store.get(config.scopeId, started.task.taskId);
    if (task != null && task.status !== 'running') {
      send({ type: 'settled', role, task });
      await store.destroyTaskControlTransport().catch(() => undefined);
      await mongoose.disconnect();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${role} settlement.`);
}

main().catch(async (error) => {
  send({ type: 'error', message: error instanceof Error ? error.stack ?? error.message : String(error) });
  try { await mongoose.disconnect(); } catch {}
  process.exitCode = 1;
});
