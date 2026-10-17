'use strict';
const assert = require('node:assert/strict');
const {
  createNativeMissionRecoveredTerminalPublisher,
} = require('../../api/server/services/Endpoints/agents/nativeMissionRecoveredTerminalPublisher');

(async () => {
  const candidate = {
    streamId: '00000000-0000-4000-8000-000000000001',
    createdAt: 1700000000000,
    checkpointNamespace: 'ns',
    checkpointId: 'mongo-head',
  };
  const claim = { ...candidate, ownerToken: 'original-recovery-owner-123456789' };
  const content = [{ type: 'text', text: '{"ok":true}' }];
  const tasks = [
    { taskId: 'mission/worker', validation: [{}] },
    { taskId: 'mission/specialist', validation: [{}] },
  ];
  const oracle = {
    evidence: {},
    results: Object.fromEntries(
      tasks.map((task) => [
        task.taskId,
        {
          taskId: task.taskId,
          verdicts: [{ status: 'VERIFIED' }],
        },
      ]),
    ),
  };
  const makeJob = () => ({
    ...candidate,
    status: 'complete',
    terminalPersistencePending: true,
    endpoint: 'agents',
    pendingAction: null,
    userId: 'owner-user',
    agent_id: 'worker',
    responseMessageId: 'response-1',
    userMessage: { messageId: 'user-1' },
    providerExecutionId: 'recovery-provider-123456789',
    providerExecutionStartedId: 'recovery-provider-123456789',
    missionCandidateContent: content,
    missionCandidateAttachments: [],
    missionOracleState: oracle,
    orchestratorPlan: { tasks },
  });
  let job = makeJob();
  let allowed = true;
  let finalizationAllowed = true;
  let writes = 0;
  let finalizations = 0;
  const events = [];
  const messages = new Map([
    [
      'user-1',
      {
        messageId: 'user-1',
        conversationId: candidate.streamId,
        user: 'owner-user',
        isCreatedByUser: true,
        text: 'mission',
      },
    ],
  ]);
  const store = {
    getJob: async () => structuredClone(job),
    finalizeRecoveredMissionTerminal: async (...args) => {
      finalizations++;
      assert.deepEqual(args.slice(0, 6), [
        candidate.streamId,
        candidate.createdAt,
        claim.ownerToken,
        job.providerExecutionId,
        candidate.checkpointNamespace,
        job.responseMessageId,
      ]);
      if (!finalizationAllowed) return false;
      assert.equal(JSON.parse(args[6]).responseMessage.content[0].text, '{"ok":true}');
      job.terminalPersistencePending = false;
      job.finalEvent = args[6];
      return true;
    },
  };
  const makePublisher = (overrides = {}) =>
    createNativeMissionRecoveredTerminalPublisher({
      store,
      candidate,
      claim,
      assertAuthorized: async () => {
        if (!allowed) throw Error('RECOVERY_PERMISSION_REVOKED');
      },
      getConversation: async () => ({ conversationId: candidate.streamId, agent_id: 'worker' }),
      getMessage: async ({ user, messageId }) => {
        const found = messages.get(messageId);
        return found?.user === user ? structuredClone(found) : null;
      },
      saveMessage: async (actor, message) => {
        assert.equal(actor.userId, 'owner-user');
        writes++;
        const saved = structuredClone(message);
        messages.set(message.messageId, saved);
        return saved;
      },
      sanitizeMessage: (message) => ({ ...message }),
      emitDone: async (stream, frame, epoch) => {
        assert.deepEqual([stream, epoch], [candidate.streamId, candidate.createdAt]);
        events.push(frame);
      },
      ...overrides,
    });

  await makePublisher()();
  assert.equal(writes, 1);
  assert.equal(finalizations, 1);
  assert.equal(events.length, 1);
  assert.equal(job.terminalPersistencePending, false);
  assert.equal(messages.get('response-1').unfinished, false);
  assert.deepEqual(messages.get('response-1').content, content);
  await assert.rejects(makePublisher()(), /JOB_NOT_VERIFIED/);
  assert.equal(events.length, 1);
  console.log('BOTMODE_RECOVERED_TERMINAL_MONGO_BEFORE_FINAL_CAS_AND_ONCE=PASS');

  job = makeJob();
  const previousWrites = writes;
  allowed = false;
  await assert.rejects(makePublisher()(), /PERMISSION_REVOKED/);
  assert.equal(writes, previousWrites);
  allowed = true;
  messages.set('user-1', { ...messages.get('user-1'), user: 'another-user' });
  await assert.rejects(makePublisher()(), /HISTORY_NOT_AUTHORIZED/);
  assert.equal(writes, previousWrites);
  messages.set('user-1', { ...messages.get('user-1'), user: 'owner-user' });
  job = {
    ...makeJob(),
    missionOracleState: {
      ...oracle,
      results: { [tasks[0].taskId]: oracle.results[tasks[0].taskId] },
    },
  };
  await assert.rejects(makePublisher()(), /JOB_NOT_VERIFIED/);
  assert.equal(writes, previousWrites);
  job = makeJob();
  finalizationAllowed = false;
  await assert.rejects(makePublisher()(), /OWNER_LOST/);
  assert.equal(job.terminalPersistencePending, true);
  assert.equal(events.length, 1);
  finalizationAllowed = true;
  job = makeJob();
  const mismatchedConvo = makePublisher({
    getConversation: async () => ({
      conversationId: candidate.streamId,
      agent_id: 'foreign-agent',
    }),
  });
  const writeCountBefore = writes;
  await assert.rejects(mismatchedConvo(), /HISTORY_NOT_AUTHORIZED/);
  assert.equal(writes, writeCountBefore);

  const missingMessage = makePublisher({
    getMessage: async ({ messageId }) => (messageId === 'user-1' ? messages.get('user-1') : null),
  });
  await assert.rejects(missingMessage(), /MESSAGE_READBACK_MISMATCH/);
  assert.equal(job.terminalPersistencePending, true);
  assert.equal(events.length, 1);

  job = {
    ...makeJob(),
    missionCandidateContent: [{ type: 'image_url', image_url: 'file:///private' }],
  };
  await assert.rejects(makePublisher()(), /JOB_NOT_VERIFIED/);
  job = { ...makeJob(), missionCandidateAttachments: [{ file_id: 'unauthorized' }] };
  await assert.rejects(makePublisher()(), /JOB_NOT_VERIFIED/);
  job = {
    ...makeJob(),
    missionOracleState: {
      ...oracle,
      results: {
        ...oracle.results,
        'mission/extra': { verdicts: [{ status: 'VERIFIED' }] },
      },
    },
  };
  await assert.rejects(makePublisher()(), /JOB_NOT_VERIFIED/);
  job = { ...makeJob(), status: 'aborted' };
  await assert.rejects(makePublisher()(), /JOB_NOT_VERIFIED/);
  assert.equal(job.terminalPersistencePending, true);

  job = makeJob();
  await assert.rejects(makePublisher({ sanitizeMessage: () => null })(), /EVENT_INVALID/);
  assert.equal(job.terminalPersistencePending, true);
  console.log('BOTMODE_RECOVERED_TERMINAL_HARD_DENIAL_AND_READBACK=PASS');
  console.log('BOTMODE_RECOVERED_TERMINAL_AUTH_ORACLE_OWNER_DENIAL=PASS');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
