'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createNativeMissionOriginalGraphRequestIntentStore } =
  require('./nativeMissionOriginalGraphRequestIntentStore');
const { createNativeMissionColdGraphReceiptProof } =
  require('./nativeMissionColdGraphReceiptProof');

const identity = {
  mode: 'native_graph', userId: 'owner', tenantId: 'tenant',
  streamId: 'parent', responseMessageId: 'response',
  generationCreatedAt: 1700000000000, checkpointNamespace: 'generation',
  graphCheckpointId: 'checkpoint-original', nodeId: 'analysis',
  taskId: 'analysis-task', agentId: 'analyst',
  provider: 'openrouter', model: 'free-model',
};
const requestDigest = 'a'.repeat(64);
const checkpointProof = {
  threadId: identity.streamId, checkpointNamespace: identity.checkpointNamespace,
  checkpointId: identity.graphCheckpointId, pendingNodes: [identity.nodeId],
};
const candidate = {
  streamId: identity.streamId, createdAt: identity.generationCreatedAt,
  checkpointNamespace: identity.checkpointNamespace,
  checkpointId: identity.graphCheckpointId,
};
const claim = { ...candidate, ownerToken: 'verified-owner-token-123456' };

function fixture() {
  const rows = new Map();
  const collection = {
    createIndex: async () => true,
    insertOne: async (record) => {
      if (rows.has(record.slotKey)) return;
      rows.set(record.slotKey, structuredClone(record));
    },
    findOne: async ({ slotKey }) => structuredClone(rows.get(slotKey) ?? null),
  };
  const intentStore = createNativeMissionOriginalGraphRequestIntentStore({ collection });
  let receiptReads = 0;
  const receiptStore = {
    readOriginalNativeGraph: async ({ identity: actual, requestDigest: digest }) => {
      receiptReads++;
      assert.deepEqual(actual, identity);
      assert.equal(digest, requestDigest);
      return {
        status: 'result_committed', resultAvailable: true,
        response: { choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'saved' } }] },
      };
    },
  };
  const prove = createNativeMissionColdGraphReceiptProof({
    intentStore, store: receiptStore, assertAuthorized: async () => true,
  });
  return { intentStore, rows, prove, getReads: () => receiptReads };
}
test('cold receipt uses the original persisted intent without new provider dispatch', async () => {
  const f = fixture();
  await f.intentStore.register({ identity, requestDigest, checkpointProof });
  const actual = await f.prove({ candidate, claim, identity, pendingNodes: ['analysis'] });
  assert.equal(actual.requestDigest, requestDigest);
  assert.equal(f.getReads(), 1);
});
test('rejects a different persisted checkpoint before receipt read', async () => {
  const f = fixture();
  await f.intentStore.register({ identity, requestDigest, checkpointProof });
  await assert.rejects(
    f.prove({ candidate, claim, identity: { ...identity, graphCheckpointId: 'mutated' },
      pendingNodes: ['analysis'] }),
    /IDENTITY_DENIED/,
  );
  assert.equal(f.getReads(), 0);
});
test('rejects changed model and digest before receipt read', async () => {
  const f = fixture();
  await f.intentStore.register({ identity, requestDigest, checkpointProof });
  await assert.rejects(
    f.prove({ candidate, claim, identity: { ...identity, model: 'paid-model' },
      pendingNodes: ['analysis'] }),
    /NOT_VERIFIED/,
  );
  await assert.rejects(
    f.prove({ candidate, claim, identity, requestDigest: 'b'.repeat(64),
      pendingNodes: ['analysis'] }),
    /UNVERIFIED/,
  );
  assert.equal(f.getReads(), 0);
});
