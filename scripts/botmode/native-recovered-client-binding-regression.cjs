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
  streamId: 'conv',
  status: 'running',
  userId: 'owner',
  agent_id: 'primary',
  orchestratorPlan: { tasks: [{ key: 'task', agentId: 'primary', nodeId: 'worker' }] },
  responseMessageId: 'response',
  userMessage: { messageId: 'user' },
  missionOracleState: { results: {}, evidence: {} },
};
const makeClient = () => ({
  conversationId: 'conv',
  options: {
    req: { user: { id: 'owner' }, body: { conversationId: 'conv' } },
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
assert.equal(client.responseMessageId, 'response');
assert.equal(client.jobCreatedAt, candidate.createdAt);
for (const override of [
  { userId: 'other' },
  { agent_id: 'other' },
  { createdAt: 1 },
  { status: 'complete' },
  { pendingAction: { id: 'pending' } },
  { checkpointNamespace: 'other' },
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
