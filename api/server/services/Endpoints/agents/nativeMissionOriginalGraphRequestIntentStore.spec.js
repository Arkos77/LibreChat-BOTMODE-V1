'use strict';

const {
  createNativeMissionOriginalGraphRequestIntentStore,
  createNativeMissionOriginalGraphRequestVerifier,
} = require('./nativeMissionOriginalGraphRequestIntentStore');
const original = {
  mode: 'native_graph', userId: 'ci-user', tenantId: 'tenant',
  streamId: 'ci-conversation', responseMessageId: 'response',
  generationCreatedAt: 1700000000000,
  checkpointNamespace: 'original-generation', graphCheckpointId: 'checkpoint',
  nodeId: 'analysis-node', taskId: 'analysis-task', agentId: 'analyst',
  provider: 'openrouter', model: 'openrouter/free',
};
const requestDigest = 'a'.repeat(64);
const checkpointProof = {
  threadId: original.streamId,
  checkpointNamespace: original.checkpointNamespace,
  checkpointId: original.graphCheckpointId,
  pendingNodes: [original.nodeId],
};
const input = { identity: original, requestDigest, checkpointProof };
function fixture() {
  const rows = new Map();
  const collection = {
    createIndex: jest.fn(async () => 'created'),
    insertOne: jest.fn(async (record) => {
      if (rows.has(record.slotKey)) {
        const error = new Error('duplicate'); error.code = 11000; throw error;
      }
      rows.set(record.slotKey, structuredClone(record));
      return { acknowledged: true };
    }),
    findOne: jest.fn(async ({ slotKey }) =>
      rows.has(slotKey) ? structuredClone(rows.get(slotKey)) : null),
  };
  const store = createNativeMissionOriginalGraphRequestIntentStore({ collection });
  return { rows, collection, store };
}
describe('original graph canonical request intent: independent durable pre-dispatch proof', () => {
  it('registers exactly one checkpoint-scoped model request without recording a prompt', async () => {
    const { store, rows, collection } = fixture();
    expect(await store.register(input)).toBe(true);
    expect(await store.register(input)).toBe(true);
    expect(await store.verify(input)).toBe(true);
    expect(rows.size).toBe(1);
    expect(collection.createIndex).toHaveBeenCalledTimes(1);
    const [saved] = rows.values();
    expect(saved.identity).toEqual(original);
    expect(saved.requestDigest).toBe(requestDigest);
    expect(JSON.stringify(saved)).not.toMatch(/messages|apiKey|userPrompt|responseJson/);
  });
  it('never allows a changed prompt, provider, model or agent to replace the original slot', async () => {
    const { store, rows } = fixture();
    await store.register(input);
    for (const modified of [
      { ...input, requestDigest: 'b'.repeat(64) },
      { ...input, identity: { ...original, provider: 'openai' } },
      { ...input, identity: { ...original, model: 'paid-model' } },
      { ...input, identity: { ...original, agentId: 'other-agent' } },
    ]) {
      await expect(store.register(modified)).rejects.toThrow(
        'NATIVE_GRAPH_REQUEST_INTENT_IMMUTABLE_CONFLICT'
      );
      await expect(store.verify(modified)).resolves.toBe(false);
      expect(rows.size).toBe(1);
    }
  });
  it('separates checkpoint generations, nodes, and tasks without a reusable operation key', async () => {
    const { store, rows } = fixture();
    await store.register(input);
    await store.register({
      identity: { ...original, graphCheckpointId: 'next-checkpoint' }, requestDigest,
      checkpointProof: { ...checkpointProof, checkpointId: 'next-checkpoint' },
    });
    await store.register({
      identity: { ...original, nodeId: 'next-node' }, requestDigest,
      checkpointProof: { ...checkpointProof, pendingNodes: ['next-node'] },
    });
    expect(rows.size).toBe(3);
    for (const bad of [
      { ...original, operationKey: 'f'.repeat(64) },
      { ...original, generationCreatedAt: 'bad' },
      { ...original, checkpointNamespace: '' },
    ]) {
      await expect(store.register({ identity: bad, requestDigest, checkpointProof }))
        .rejects.toThrow('NATIVE_GRAPH_REQUEST_INTENT_INVALID');
    }
  });
  it('independent broker compares original model request bytes to the saved digest', async () => {
    const { store } = fixture();
    const { requestDigest: canonicalDigest } = require('./nativeMissionProviderBrokerHttp');
    const body = {
      model: 'openrouter/free', stream: false,
      messages: [{ role: 'user', content: 'original fixed prompt' }],
    };
    const digest = canonicalDigest(body);
    await store.register({ identity: original, requestDigest: digest, checkpointProof });
    const verify = createNativeMissionOriginalGraphRequestVerifier({ intentStore: store });
    const brokerScope = {
      userId: original.userId, tenantId: original.tenantId,
      conversationId: original.streamId,
      responseMessageId: original.responseMessageId,
      createdAt: original.generationCreatedAt,
      checkpointNamespace: original.checkpointNamespace,
      checkpointId: original.graphCheckpointId,
      nodeId: original.nodeId, taskId: original.taskId, agentId: original.agentId,
      provider: original.provider, model: original.model,
      requestDigest: digest, authorizedRequest: body,
    };
    expect(await verify(brokerScope)).toBe(true);
    for (const modified of [
      { authorizedRequest: { ...body, messages: [{ role: 'user', content: 'changed' }] } },
      { model: 'paid-model' }, { checkpointId: 'foreign-checkpoint' },
      { agentId: 'other-agent' }, { requestDigest: 'c'.repeat(64) },
    ]) {
      expect(await verify({ ...brokerScope, ...modified })).toBe(false);
    }
    expect(() => createNativeMissionOriginalGraphRequestVerifier({}))
      .toThrow('NATIVE_GRAPH_REQUEST_INTENT_VERIFIER_MISSING');
  });

  it('does not interpret missing or malformed original intent as a granted provider request', async () => {
    const { store, collection } = fixture();
    expect(await store.verify(input)).toBe(false);
    const invalid = [{ ...input, requestDigest: 'bad' },
      { ...input, identity: { ...original, mode: 'detached' } }];
    for (const item of invalid) {
      await expect(store.verify(item)).rejects.toThrow(
        'NATIVE_GRAPH_REQUEST_INTENT_INVALID'
      );
    }
    collection.createIndex.mockRejectedValueOnce(new Error('DB_UNAVAILABLE'));
    await expect(store.register(input)).rejects.toThrow('DB_UNAVAILABLE');
    expect(await store.verify(input)).toBe(false);
  });
});
