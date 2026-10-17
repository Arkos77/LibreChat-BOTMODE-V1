'use strict';
const assert = require('node:assert/strict');
const {
  createNativeMissionColdGraphBuilder,
} = require('../../api/server/services/Endpoints/agents/nativeMissionColdGraphBuilder');
(async () => {
  const candidate = {
    streamId: 'conversation',
    createdAt: 1700000000000,
    checkpointNamespace: 'namespace',
    checkpointId: 'head',
  };
  const claim = { ...candidate, ownerToken: 'owner' };
  const graph = { getState: async () => ({}), invoke: async () => {} };
  let calls = 0,
    auth = 0;
  const createRun = async (options) => {
    calls++;
    assert.deepEqual(options.messages, []);
    assert.equal(options.hitlCapable, false);
    assert.equal(options.assertNativeMissionReplayFences, undefined);
    return { Graph: { createWorkflow: () => graph } };
  };
  const plan = { tasks: [{ nodeId: 'worker', agentId: 'specialist' }] };
  const options = {
    agents: [{ id: 'primary' }, { id: 'specialist' }],
    orchestratorPlan: plan,
    conversationId: 'conversation',
    runId: 'response',
    messages: [],
    signal: new AbortController().signal,
    appConfig: {},
    user: { id: 'user' },
    tenantId: 'tenant',
    modelCallbacks: [() => {}],
    resolveMissionOracleEvidence: async () => [],
    persistMissionOracleResult: async () => {},
    requestBody: { conversationId: 'conversation' },
    toolExecution: {},
    assertNativeMissionReplayFences: async ({ candidate: c, claim: l }) =>
      c === candidate && l === claim,
  };
  const client = {
    conversationId: 'conversation',
    jobCreatedAt: candidate.createdAt,
    checkpointNamespace: 'namespace',
    orchestratorPlan: plan,
    options: { agent: { id: 'primary' }, req: { user: { id: 'user', tenantId: 'tenant' } } },
    responseMessageId: 'response',
    createNativeMissionColdRunOptions: async () => options,
  };
  const builder = createNativeMissionColdGraphBuilder({ createRun });
  assert.equal(
    await builder({
      client,
      candidate,
      claim,
      assertAuthorized: async () => {
        auth++;
      },
    }),
    graph,
  );
  assert.equal(calls, 1);
  assert.equal(auth, 4);
  await assert.rejects(
    builder({
      client: {
        ...client,
        createNativeMissionColdRunOptions: async () => ({
          ...options,
          assertNativeMissionReplayFences: async () => false,
        }),
      },
      candidate,
      claim,
      assertAuthorized: async () => {},
    }),
    /REPLAY_PROOFS_MISSING/,
  );
  assert.equal(calls, 1);
  for (const changed of [
    { user: { id: 'other' } },
    { tenantId: 'other' },
    { requestBody: { conversationId: 'other' } },
    { signal: AbortSignal.abort() },
  ]) {
    await assert.rejects(
      builder({
        client: {
          ...client,
          createNativeMissionColdRunOptions: async () => ({ ...options, ...changed }),
        },
        candidate,
        claim,
        assertAuthorized: async () => {},
      }),
      /REPLAY_PROOFS_MISSING/,
    );
  }
  assert.equal(calls, 1);
  await assert.rejects(
    builder({
      client: {
        ...client,
        createNativeMissionColdRunOptions: async () => ({
          ...options,
          agents: [{ id: 'primary' }],
        }),
      },
      candidate,
      claim,
      assertAuthorized: async () => {},
    }),
    /AGENT_SET_MISMATCH/,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    builder({
      client: {
        ...client,
        createNativeMissionColdRunOptions: async () => ({
          ...options,
          assertNativeMissionReplayFences: async () => {
            throw Error('unfenced');
          },
        }),
      },
      candidate,
      claim,
      assertAuthorized: async () => {},
    }),
    /unfenced/,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    builder({
      client: { ...client, createNativeMissionColdRunOptions: undefined },
      candidate,
      claim,
      assertAuthorized: async () => {},
    }),
    /HOST_OPTIONS_MISSING/,
  );
  console.log('BOTMODE_COLD_GRAPH_HOST_GUARDS_AND_NO_EXECUTION=PASS');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
