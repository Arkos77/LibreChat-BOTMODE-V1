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
    assert.equal(options.nativeMissionReplayFencesQualified, undefined);
    return { Graph: { createWorkflow: () => graph } };
  };
  const plan = { tasks: [{ nodeId: 'worker' }] };
  const options = {
    agents: [{ id: 'primary' }],
    orchestratorPlan: plan,
    conversationId: 'conversation',
    runId: 'response',
    messages: [],
    signal: new AbortController().signal,
    appConfig: {},
    user: { id: 'user' },
    modelCallbacks: [() => {}],
    resolveMissionOracleEvidence: async () => [],
    persistMissionOracleResult: async () => {},
    requestBody: { conversationId: 'conversation' },
    toolExecution: {},
    nativeMissionReplayFencesQualified: true,
  };
  const client = {
    conversationId: 'conversation',
    jobCreatedAt: candidate.createdAt,
    checkpointNamespace: 'namespace',
    orchestratorPlan: plan,
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
  assert.equal(auth, 3);
  await assert.rejects(
    builder({
      client: {
        ...client,
        createNativeMissionColdRunOptions: async () => ({
          ...options,
          nativeMissionReplayFencesQualified: false,
        }),
      },
      candidate,
      claim,
      assertAuthorized: async () => {},
    }),
    /REPLAY_PROOFS_MISSING/,
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
