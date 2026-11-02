'use strict';

/** PR107 bounded integration: a real Mongo origin, a real wakeup resolver,
 * and two synthetic terminal child receipts across the Mongo restart. No
 * model execution, Oracle verdict, publication, or external credentials. */
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const {
  createAgentTriggerEnvelope,
  createSubagentCompletionWakeupResolver,
} = require('@librechat/api');
const {
  getNativeMissionWakeupOrigin,
} = require('../../api/server/services/Endpoints/agents/nativeMissionWakeupOriginStore');

const now = Date.now();
const scope = {
  userId: 'ci-wakeup-user',
  tenantId: 'ci-wakeup-tenant',
  conversationId: 'ci-wakeup-conversation',
  parentResponseMessageId: 'ci-wakeup-original-response',
  agentId: 'ci-wakeup-worker',
};
const mission = {
  missionId: 'ci-wakeup-mission',
  taskId: 'ci-wakeup-root-task',
  objective: 'Verify durable asynchronous provenance',
};
const config = { version: 1, mode: 'analyze', workerAgentId: scope.agentId };
const originals = [
  { threadId: 'ci-research-thread', taskId: 'ci-research-task', subagentType: 'researcher' },
  { threadId: 'ci-analysis-thread', taskId: 'ci-analysis-task', subagentType: 'analyst' },
];
const terminals = originals.map(({ threadId, taskId, subagentType }, index) => ({
  messageId: taskId + ':assistant',
  conversationId: threadId,
  parentMessageId: taskId + ':user',
  sender: subagentType,
  text: 'Bounded synthetic result ' + String(index + 1),
  isCreatedByUser: false,
  createdAt: new Date(now - 50 + index),
  updatedAt: new Date(now - 50 + index),
  subagentTask: {
    attemptKey: taskId + '-attempt',
    parentRunId: scope.parentResponseMessageId,
    status: 'completed',
  },
}));

async function main() {
  await mongoose.connect('mongodb://127.0.0.1:27017/botmode_pr107_mongo_origin', {
    serverSelectionTimeoutMS: 15000,
  });
  try {
    let responseBranch = [
      {
        messageId: scope.parentResponseMessageId,
        parentMessageId: 'ci-user-message',
        isCreatedByUser: false,
        createdAt: new Date(now - 100),
      },
      {
        messageId: 'ci-wakeup-user-1',
        parentMessageId: scope.parentResponseMessageId,
        isCreatedByUser: true,
        createdAt: new Date(now - 75),
      },
      {
        messageId: 'ci-wakeup-response-1',
        parentMessageId: 'ci-wakeup-user-1',
        isCreatedByUser: false,
        createdAt: new Date(now - 60),
      },
    ];
    const claims = new Set();
    const methods = {
      getConvo: async (userId, conversationId) => {
        assert.equal(userId, scope.userId);
        if (conversationId === scope.conversationId) {
          return { conversationId, tenantId: scope.tenantId, botMode: config };
        }
        const match = originals.find((item) => item.threadId === conversationId);
        return match == null ? null : {
          conversationId,
          tenantId: scope.tenantId,
          subagentThread: {
            parentConversationId: scope.conversationId,
            parentMessageId: scope.parentResponseMessageId,
            parentAgentId: scope.agentId,
            subagentType: match.subagentType,
          },
        };
      },
      getMessages: async (filter) => {
        if (filter.conversationId === scope.conversationId) return responseBranch;
        if (filter.conversationId != null) {
          const index = originals.findIndex((item) => item.threadId === filter.conversationId);
          if (index < 0) return [];
          const origin = originals[index];
          return [
            {
              messageId: origin.taskId + ':user',
              conversationId: origin.threadId,
              isCreatedByUser: true,
              subagentTask: {
                attemptKey: origin.taskId + '-attempt',
                parentRunId: scope.parentResponseMessageId,
                status: 'running',
              },
            },
            terminals[index],
          ];
        }
        if (filter['subagentTask.parentRunId'] === scope.parentResponseMessageId) {
          return terminals;
        }
        return [];
      },
      listActiveSubagentThreadLeases: async () => [],
      claimSubagentTaskResult: async (claim) => {
        assert.equal(claim.userId, scope.userId);
        assert.equal(claim.kind, 'wakeup');
        const key = claim.conversationId + '/' + claim.taskId;
        if (claims.has(key)) return { status: 'claimed' };
        claims.add(key);
        const item = terminals.find((terminal) => (
          terminal.conversationId === claim.conversationId &&
          terminal.messageId === claim.taskId + ':assistant'
        ));
        assert.ok(item, 'Exact child result lineage required');
        return { status: 'acquired', message: item };
      },
      releaseSubagentTaskResultClaim: async () => true,
    };
    const resolve = createSubagentCompletionWakeupResolver({
      methods,
      getGenerationJob: async () => ({ status: 'complete' }),
      getMissionOrigin: getNativeMissionWakeupOrigin,
      now: () => now,
    });

    for (let index = 0; index < originals.length; index += 1) {
      const original = originals[index];
      const envelope = createAgentTriggerEnvelope({
        mode: 'continue',
        requestId: 'ci-wakeup-request-' + index,
        deliveryId: original.taskId,
        receivedAt: now,
        principal: { id: scope.userId, tenantId: scope.tenantId },
        event: {
          id: original.taskId,
          type: 'subagent.completion',
          occurredAt: now,
          source: { id: 'subagent-completion', type: 'internal' },
          payload: original,
        },
        target: {
          agentId: scope.agentId,
          conversationId: scope.conversationId,
          parentMessageId: scope.parentResponseMessageId,
        },
        input: 'pending',
      });
      const result = await resolve(envelope, { idempotencyKey: 'ci-wakeup-key-' + index });
      assert.equal(result?.status, 'ready', 'both wakeups must be admissible');
      assert.equal(result.missionContext?.originalPlanId, 'ci-wakeup-plan');
      assert.deepEqual(result.missionContext?.orchestratorMission?.mission, mission);
      assert.equal(result.missionContext?.originalResponseMessageId, scope.parentResponseMessageId);
      assert.equal(result.parentMessageId, 'ci-wakeup-response-' + (index + 1));
      assert.ok(result.input.includes(original.taskId), 'bounded child identity should survive');
      assert.ok(result.input.includes('Host-authored bounded orchestration snapshot:'));
      if (index === 0) {
        responseBranch = responseBranch.concat(
          {
            messageId: 'ci-wakeup-user-2',
            parentMessageId: 'ci-wakeup-response-1',
            isCreatedByUser: true,
            createdAt: new Date(now - 40),
          },
          {
            messageId: 'ci-wakeup-response-2',
            parentMessageId: 'ci-wakeup-user-2',
            isCreatedByUser: false,
            createdAt: new Date(now - 20),
          },
        );
      }
    }
    assert.equal(claims.size, 2);
    console.log('BOTMODE_REAL_MONGO_TWO_RESOLVER_WAKEUPS=PASS');
    console.log('BOTMODE_REAL_MONGO_ORIGINAL_ORACLE_PLAN_THROUGH_TWO_WAKEUPS=PASS');
    console.log('BOTMODE_REAL_MONGO_WAKEUP_BRANCH_ADVANCE=PASS');
    console.log('SCOPE=Real resolver with synthetic child receipts; not live model execution or Oracle/P6 publication');
  } finally {
    await mongoose.disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
