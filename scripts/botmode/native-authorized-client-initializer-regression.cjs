'use strict';
const assert = require('node:assert/strict');
const {
  createNativeMissionAuthorizedClientInitializer,
} = require('../../api/server/services/Endpoints/agents/nativeMissionAuthorizedClientInitializer');
const candidate = {
  streamId: 'conv',
  createdAt: 1700000000000,
  checkpointNamespace: 'epoch',
  checkpointId: 'head',
};
const claim = { ...candidate, ownerToken: 'owner' };
const job = {
  ...candidate,
  status: 'running',
  providerDrained: false,
  providerExecutionId: 'provider',
  providerExecutionStartedId: 'provider',
  endpoint: 'agents',
  userId: 'user',
  tenantId: 'tenant',
  agent_id: 'primary',
  orchestratorPlan: { tasks: [{ key: 'worker', agentId: 'primary' }] },
};
let checks = 0;
const user = { _id: 'user', id: 'user', tenantId: 'tenant', role: 'USER' };
const auth = {
  getUserById: async () => user,
  isOwnerAdmissible: async () => true,
  getConvo: async () => ({ conversationId: 'conv', tenantId: 'tenant', agent_id: 'primary' }),
  getAgent: async ({ id }) => ({ id, _id: 'mongo-' + id }),
  canViewAgent: async () => true,
};
const store = { getJob: async () => job };
const manager = { getJobStore: () => store };
const init = async ({ context }) => ({
  conversationId: 'conv',
  options: {
    agent: { id: 'primary' },
    req: { user: context.user, body: { conversationId: 'conv' }, config: {} },
  },
  createNativeMissionColdRunOptions: async () => ({}),
});
(async () => {
  const deps = { manager, authorizationDeps: auth, initializeClientFromDocuments: init };
  const initialize = createNativeMissionAuthorizedClientInitializer(deps);
  assert.equal(
    (
      await initialize({
        candidate,
        claim,
        assertAuthorized: async () => {
          checks++;
        },
      })
    ).job,
    job,
  );
  assert.equal(checks, 4);
  const noHttp = createNativeMissionAuthorizedClientInitializer({
    ...deps,
    initializeClientFromDocuments: async ({ context }) => ({
      conversationId: 'conv',
      options: {
        agent: { id: 'primary' },
        agentRuntime: {
          user: context.user,
          requestBody: { conversationId: 'conv' },
          appConfig: {},
        },
      },
      createNativeMissionColdRunOptions: async () => ({}),
    }),
  });
  assert.equal((await noHttp({ candidate, claim, assertAuthorized: async () => {} })).job, job);
  for (const [changed, expected] of [
    [{ claim: { ...claim, checkpointId: 'wrong' } }, /CLAIM_DENIED/],
    [{ candidate: { ...candidate, createdAt: 3 } }, /CLAIM_DENIED/],
  ])
    await assert.rejects(
      initialize({ candidate, claim, assertAuthorized: async () => {}, ...changed }),
      expected,
    );
  await assert.rejects(
    createNativeMissionAuthorizedClientInitializer({
      ...deps,
      initializeClientFromDocuments: async () => ({
        ...(await init({ context: { user } })),
        createNativeMissionColdRunOptions: undefined,
      }),
    })({ candidate, claim, assertAuthorized: async () => {} }),
    /CLIENT_DENIED/,
  );
  const altered = { ...job, status: 'stopped' };
  let jobReads = 0;
  const changingStore = { getJob: async () => (++jobReads === 1 ? job : altered) };
  await assert.rejects(
    createNativeMissionAuthorizedClientInitializer({
      ...deps,
      manager: { getJobStore: () => changingStore },
    })({ candidate, claim, assertAuthorized: async () => {} }),
    /JOB_CHANGED/,
  );
  assert.throws(
    () =>
      createNativeMissionAuthorizedClientInitializer({
        ...deps,
        initializeClientFromDocuments: undefined,
      }),
    /UNAVAILABLE/,
  );
  console.log('BOTMODE_NATIVE_AUTHORIZED_CLIENT_INITIALIZER_CONTRACT=PASS');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
