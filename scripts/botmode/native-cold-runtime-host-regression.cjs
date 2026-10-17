'use strict';
const assert = require('node:assert/strict');
const {
  createNativeMissionColdRuntimeHost,
} = require('../../api/server/services/Endpoints/agents/nativeMissionColdRuntimeHost');
(async () => {
  const candidate = {
    streamId: 'c',
    createdAt: 1700000000000,
    checkpointNamespace: 'epoch',
    checkpointId: 'head',
  };
  const claim = { ...candidate, ownerToken: 'token' };
  const job = {
    ...candidate,
    status: 'running',
    userId: 'owner',
    agent_id: 'primary',
    responseMessageId: 'response',
    userMessage: { messageId: 'user' },
    orchestratorPlan: { tasks: [{ key: 'task', nodeId: 'worker', agentId: 'primary' }] },
  };
  const client = () => ({
    conversationId: 'c',
    options: {
      req: { user: { id: 'owner' }, body: { conversationId: 'c' } },
      agent: { id: 'primary' },
    },
    publicationBarrier: {
      activate() {
        this.active = true;
      },
    },
  });
  const graph = { getState: async () => ({}), invoke: async () => {} };
  const events = [];
  const args = {
    initializeAuthorizedClient: async () => {
      events.push('init');
      return { client: client(), job };
    },
    normalizeOracleState: (x) => x,
    reconstructGraph: async ({ client }) => {
      assert.equal(client.publicationBarrier.active, true);
      events.push('graph');
      return graph;
    },
    replaySafety: async () => async () => {},
    effectFences: async () => async () => {
      events.push('fences');
    },
    oracle: async () => async () => {},
    publication: async () => ({
      getCandidate: async () => ({ content: [], attachments: [], oracle: {} }),
      publishTerminal: async () => {},
    }),
  };
  let checks = 0;
  const assertAuthorized = async () => {
    checks++;
    events.push('auth');
  };
  const reconstruct = createNativeMissionColdRuntimeHost(args);
  const runtime = await reconstruct({ candidate, claim, assertAuthorized });
  assert.equal(runtime.graph, graph);
  assert.equal(checks, 3);
  assert.deepEqual(events, ['auth', 'init', 'auth', 'graph', 'auth', 'fences']);
  await assert.rejects(
    reconstruct({ candidate, claim: { ...claim, checkpointId: 'wrong' }, assertAuthorized }),
    /CLAIM_MISMATCH/,
  );
  await assert.rejects(
    createNativeMissionColdRuntimeHost({ ...args, effectFences: async () => null })({
      candidate,
      claim,
      assertAuthorized,
    }),
    /CAPABILITIES_MISSING/,
  );
  await assert.rejects(
    createNativeMissionColdRuntimeHost({
      ...args,
      initializeAuthorizedClient: async () => ({
        client: client(),
        job: { ...job, userId: 'other' },
      }),
    })({ candidate, claim, assertAuthorized }),
    /BINDING_DENIED/,
  );
  console.log('BOTMODE_COLD_RUNTIME_AUTH_CLIENT_GRAPH_FENCES=PASS');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
