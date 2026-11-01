'use strict';

const {
  createNativeMissionOriginalGraphRequestIntentStore,
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
const input = { identity: original, requestDigest };
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
      { identity: original, requestDigest: 'b'.repeat(64) },
      { identity: { ...original, provider: 'openai' }, requestDigest },
      { identity: { ...original, model: 'paid-model' }, requestDigest },
      { identity: { ...original, agentId: 'other-agent' }, requestDigest },
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
    });
    await store.register({
      identity: { ...original, nodeId: 'next-node' }, requestDigest,
    });
    expect(rows.size).toBe(3);
    for (const bad of [
      { ...original, operationKey: 'f'.repeat(64) },
      { ...original, generationCreatedAt: 'bad' },
      { ...original, checkpointNamespace: '' },
    ]) {
      await expect(store.register({ identity: bad, requestDigest }))
        .rejects.toThrow('NATIVE_GRAPH_REQUEST_INTENT_INVALID');
    }
  });
  it('does not interpret missing or malformed original intent as a granted provider request', async () => {
    const { store, collection } = fixture();
    expect(await store.verify(input)).toBe(false);
    const invalid = [{ identity: original, requestDigest: 'bad' },
      { identity: { ...original, mode: 'detached' }, requestDigest }];
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
