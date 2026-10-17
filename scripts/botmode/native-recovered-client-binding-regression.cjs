'use strict';
const assert = require('node:assert/strict');
const {
  bindNativeMissionRecoveredClient,
} = require('../../api/server/services/Endpoints/agents/nativeMissionRecoveredClientBinding');
const candidate = {
  streamId: 'conv',
  createdAt: 1700000000000,
  checkpointNamespace: 'epoch',
  checkpointId: 'head',
};
const job = {
  ...candidate,
  checkpointId: undefined,
  streamId: 'conv',
  status: 'running',
  userId: 'owner',
  tenantId: 'tenant',
  agent_id: 'primary',
  orchestratorPlan: { tasks: [{ key: 'task', agentId: 'primary', nodeId: 'worker' }] },
  responseMessageId: 'response',
  userMessage: { messageId: 'user' },
  missionOracleState: { results: {}, evidence: {} },
};
const makeClient = () => ({
  conversationId: 'conv',
  options: {
    req: { user: { id: 'owner', tenantId: 'tenant' }, body: { conversationId: 'conv' } },
    agent: { id: 'primary' },
  },
  publicationBarrier: {
    activate() {
      this.active = true;
    },
  },
});
const normalizer = (x) => x;
const client = makeClient();
assert.equal(
  bindNativeMissionRecoveredClient({ client, candidate, job, normalizeOracleState: normalizer }),
  client,
);
assert.equal(client.publicationBarrier.active, true);
assert.equal(job.checkpointId, undefined);
assert.equal(client.responseMessageId, 'response');
assert.equal(client.jobCreatedAt, candidate.createdAt);
const requestFree = makeClient();
requestFree.options.agentRuntime = {
  user: requestFree.options.req.user,
  requestBody: requestFree.options.req.body,
  appConfig: {},
};
delete requestFree.options.req;
assert.equal(
  bindNativeMissionRecoveredClient({
    client: requestFree,
    candidate,
    job,
    normalizeOracleState: normalizer,
  }),
  requestFree,
);
assert.equal(requestFree.publicationBarrier.active, true);
const mixed = makeClient();
mixed.options.agentRuntime = {
  user: { id: 'owner', tenantId: 'other' },
  requestBody: { conversationId: 'conv' },
  appConfig: {},
};
assert.throws(
  () =>
    bindNativeMissionRecoveredClient({
      client: mixed,
      candidate,
      job,
      normalizeOracleState: normalizer,
    }),
  /DENIED/,
);

for (const override of [
  { userId: 'other' },
  { tenantId: 'other' },
  { checkpointId: 'other' },
  { checkpointId: '' },
  { agent_id: 'other' },
  { createdAt: 1 },
  { status: 'complete' },
  { pendingAction: { id: 'pending' } },
  { checkpointNamespace: 'other' },
  { responseMessageId: undefined },
  { userMessage: undefined },
]) {
  assert.throws(
    () =>
      bindNativeMissionRecoveredClient({
        client: makeClient(),
        candidate,
        job: { ...job, ...override },
        normalizeOracleState: normalizer,
      }),
    /DENIED/,
  );
}
assert.throws(
  () =>
    bindNativeMissionRecoveredClient({
      client: { ...makeClient(), responseMessageId: 'wrong' },
      candidate,
      job,
      normalizeOracleState: normalizer,
    }),
  /DENIED/,
);
assert.throws(
  () =>
    bindNativeMissionRecoveredClient({
      client: makeClient(),
      candidate,
      job,
      normalizeOracleState: () => {
        throw Error('invalid oracle');
      },
    }),
  /invalid oracle/,
);
console.log('BOTMODE_COLD_RECOVERED_CLIENT_IDENTITY_AND_BARRIER_BINDING=PASS');
