'use strict';
const assert = require('node:assert/strict');
const Module = require('node:module');
const realLoad = Module._load;
// This model-only fixture tests Oracle/persistence, never research-v2 rendering.
// The independently tested presentation module is not built in this cold CI job.
Module._load = function load(request, parent, isMain) {
  if (
    request === '@librechat/api' &&
    parent?.filename?.endsWith('/nativeMissionModelOnlyRecoveryCallbacks.js')
  ) {
    return {
      renderMissionPublication: async (plan) => {
        assert.ok(Array.isArray(plan?.tasks) && plan.tasks.length > 0);
        assert.ok(
          plan.tasks.every(
            (task) => task.validation.every((v) => v.outputContract !== 'research-v2'),
          ),
          'research-v2 must use the actual publication renderer',
        );
        return undefined;
      },
    };
  }
  return realLoad.call(this, request, parent, isMain);
};
let createNativeMissionModelOnlyRecoveryCallbacks;
try {
  ({ createNativeMissionModelOnlyRecoveryCallbacks } = require(
    '../../api/server/services/Endpoints/agents/nativeMissionModelOnlyRecoveryCallbacks'
  ));
} finally {
  Module._load = realLoad;
}
const {
  createNativeMissionDurablePublicationStage,
} = require('../../api/server/services/Endpoints/agents/nativeMissionDurablePublicationStage');
(async () => {
  const candidate = {
    streamId: 'thread',
    createdAt: 1700000000000,
    checkpointNamespace: 'ns',
    checkpointId: 'head',
  };
  const claim = { ...candidate, ownerToken: 'owner-123456789123456' };
  const tasks = [
    {
      key: 'worker',
      taskId: 'mission/worker',
      nodeId: 'p6_worker',
      agentId: 'worker',
      dependsOn: [],
      validation: [{}],
    },
    {
      key: 'specialist',
      taskId: 'mission/specialist',
      nodeId: 'p6_specialist',
      agentId: 'specialist',
      dependsOn: ['worker'],
      validation: [{}],
    },
  ];
  const plan = { mission: { missionId: 'mission' }, tasks };
  const initial = () => ({
    ...candidate,
    status: 'running',
    endpoint: 'agents',
    userId: 'owner-user',
    agent_id: 'worker',
    orchestratorPlan: plan,
    responseMessageId: 'response-1',
    userMessage: { messageId: 'user-1' },
    providerExecutionId: 'provider-1',
    providerExecutionStartedId: 'provider-1',
    providerDrained: false,
  });
  let job = initial();
  let writes = 0;
  let finalized = 0;
  const emitted = [];
  const messages = new Map([
    [
      'user-1',
      {
        messageId: 'user-1',
        user: 'owner-user',
        conversationId: candidate.streamId,
        isCreatedByUser: true,
      },
    ],
  ]);
  const store = {
    getJob: async () => structuredClone(job),
    updateRecoveredMissionEvidence: async (thread, epoch, owner, provider, updates) => {
      assert.deepEqual(
        [thread, epoch, owner, provider],
        [candidate.streamId, candidate.createdAt, claim.ownerToken, job.providerExecutionId],
      );
      writes++;
      Object.assign(job, structuredClone(updates));
      return true;
    },
    finalizeRecoveredMissionTerminal: async (
      thread,
      epoch,
      owner,
      provider,
      namespace,
      responseId,
      event,
    ) => {
      assert.deepEqual(
        [thread, epoch, owner, provider, namespace, responseId],
        [
          candidate.streamId,
          candidate.createdAt,
          claim.ownerToken,
          job.providerExecutionId,
          candidate.checkpointNamespace,
          job.responseMessageId,
        ],
      );
      assert.equal(JSON.parse(event).responseMessage.content[0].text, '{"ok":true}');
      finalized++;
      job.terminalPersistencePending = false;
      return true;
    },
  };
  const graph = {
    getState: async () => ({
      next: [],
      tasks: [],
      values: {
        agentOutputs: {
          p6_worker: { content: '{"ok":true}' },
          p6_specialist: { content: '{"ok":true}' },
        },
      },
    }),
  };
  const client = {
    orchestratorPlan: plan,
    options: {
      nativeMissionRecoveredOraclePersister: async (result) => {
        const state = {
          evidence: {},
          results: { ...job.missionOracleState?.results, [result.taskId]: result },
        };
        await store.updateRecoveredMissionEvidence(
          candidate.streamId,
          candidate.createdAt,
          claim.ownerToken,
          job.providerExecutionId,
          { missionOracleState: state },
        );
        return structuredClone(state);
      },
    },
  };
  const auth = async () => {};
  const callbacks = createNativeMissionModelOnlyRecoveryCallbacks({
    manager: { getJobStore: () => store },
    validateMissionTask: async (input) => ({
      taskId: input.taskId,
      nodeId: input.nodeId,
      verdicts: [
        {
          status: 'VERIFIED',
          input: { candidate: input.candidate },
        },
      ],
    }),
    normalizeOracleState: (state) => structuredClone(state),
    areMissionOracleResultsEquivalent: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    getConversation: async () => ({ conversationId: candidate.streamId, agent_id: 'worker' }),
    getMessage: async ({ user, messageId }) =>
      messages.get(messageId)?.user === user ? structuredClone(messages.get(messageId)) : null,
    saveMessage: async ({ userId }, m) => {
      assert.equal(userId, 'owner-user');
      messages.set(m.messageId, structuredClone(m));
      return m;
    },
    sanitizeMessage: (m) => ({ ...m }),
    emitDone: async (_thread, event) => {
      emitted.push(event);
    },
  });
  const context = { candidate, claim, client, graph, assertAuthorized: auth };
  const verify = await callbacks.oracle(context);
  await verify();
  assert.equal(writes, 2);
  const publication = await callbacks.publication(context);
  const privateCandidate = await publication.getCandidate();
  assert.equal(privateCandidate.content[0].text, '{"ok":true}');
  assert.deepEqual(
    Object.keys(privateCandidate.oracle.results).sort(),
    tasks.map((t) => t.taskId).sort(),
  );
  await createNativeMissionDurablePublicationStage({
    store,
    identity: { ...claim, providerExecutionId: 'provider-1' },
    getCandidate: publication.getCandidate,
  })();
  assert.equal(writes, 3);
  job.status = 'complete';
  job.terminalPersistencePending = true;
  await publication.publishTerminal();
  assert.equal(finalized, 1);
  assert.equal(emitted.length, 1);
  assert.equal(messages.get('response-1').isCreatedByUser, false);
  await assert.rejects(publication.publishTerminal(), /JOB_NOT_VERIFIED/);
  console.log('BOTMODE_COLD_MODEL_ONLY_ORACLE_STAGE_HISTORY_FINAL_ONCE=PASS');
  job = {
    ...initial(),
    orchestratorPlan: { ...plan, tasks: tasks.map((t) => ({ ...t, dependsOn: [] })) },
  };
  await assert.rejects(publication.getCandidate(), /PLAN_DENIED/);
  console.log('BOTMODE_COLD_MODEL_ONLY_PLAN_CHANGE_DENIED=PASS');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
