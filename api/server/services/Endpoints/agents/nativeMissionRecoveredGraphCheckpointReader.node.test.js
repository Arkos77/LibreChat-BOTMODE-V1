'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createNativeMissionRecoveredGraphCheckpointReader } =
  require('./nativeMissionRecoveredGraphCheckpointReader');
const plan = { tasks: [
  { key: 'research', nodeId: 'research', taskId: 't1', agentId: 'researcher' },
  { key: 'analysis', nodeId: 'analysis', taskId: 't2', agentId: 'analyst', dependsOn: ['research'] },
] };
const scope = { streamId: 'conversation', generationCreatedAt: 1700000000000,
  checkpointNamespace: 'generation', responseMessageId: 'response',
  userId: 'owner', nodeId: 'analysis', taskId: 't2', agentId: 'analyst' };
function fixture() {
  const candidate = { streamId: 'conversation', createdAt: scope.generationCreatedAt,
    checkpointNamespace: 'generation', checkpointId: 'original-checkpoint' };
  const claim = { ...candidate, ownerToken: 'token-1234567890123456' };
  const client = { orchestratorPlan: plan, conversationId: 'conversation',
    jobCreatedAt: scope.generationCreatedAt, checkpointNamespace: 'generation',
    responseMessageId: 'response', user: 'owner' };
  let readCount = 0;
  const graph = { getState: async () => {
    readCount++;
    return { config: { configurable: { thread_id: 'conversation',
      __librechat_checkpoint_ns: 'generation', checkpoint_id: 'original-checkpoint' } },
    next: ['analysis'], tasks: [{ name: 'analysis', interrupts: [] }],
    values: { agentOutputs: { research: { content: 'persisted research' } } } };
  } };
  const context = { candidate, claim, client, graph, assertAuthorized: async () => true };
  const read = createNativeMissionRecoveredGraphCheckpointReader({
    getRecoveryContext: async () => context,
  });
  return { read, candidate, claim, client, graph, context, getReads: () => readCount };
}
test('reads exact original pending analysis from reconstructed durable graph', async () => {
  const f = fixture();
  const result = await f.read({ scope, plan, client: f.client });
  assert.equal(result.checkpointId, f.candidate.checkpointId);
  assert.deepEqual(result.pendingNodes, ['analysis']);
  assert.equal(f.getReads(), 1);
});
test('rejects altered checkpoint and stale owner before returning proof', async () => {
  const f = fixture();
  f.candidate.checkpointId = 'other';
  f.claim.checkpointId = 'other';
  await assert.rejects(f.read({ scope, plan, client: f.client }),
    /NATIVE_GRAPH_CHECKPOINT_PENDING_TASK_UNPROVEN/);
  const g = fixture();
  g.claim.checkpointId = 'different';
  await assert.rejects(g.read({ scope, plan, client: g.client }),
    /NATIVE_COLD_GRAPH_READER_ORIGIN_MISMATCH/);
});
test('rejects a different initialized client without reading graph', async () => {
  const f = fixture();
  await assert.rejects(f.read({ scope, plan, client: { ...f.client } }),
    /NATIVE_COLD_GRAPH_READER_ORIGIN_MISMATCH/);
  assert.equal(f.getReads(), 0);
});
