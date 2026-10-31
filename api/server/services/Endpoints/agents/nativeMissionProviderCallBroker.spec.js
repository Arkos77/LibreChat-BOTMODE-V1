'use strict';

const { createHash } = require('node:crypto');
const {
  createNativeMissionProviderCallReceiptStore,
} = require('./nativeMissionProviderCallReceiptStore');
const { createNativeMissionProviderCallBroker } = require('./nativeMissionProviderCallBroker');

const digest = (value) => createHash('sha256').update(value).digest('hex');
const identity = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  parentConversationId: 'parent-convo',
  parentRunId: 'parent-response',
  childThreadId: 'child-convo',
  taskId: 'task-id',
  attemptKey: 'attempt-1',
  agentId: 'agent-1',
  provider: 'local-fixture',
  model: 'ci-free',
  operationKey: digest('original-model-call-1'),
};
const scope = { identity, requestDigest: digest('canonical-original-model-request') };

function createCollection() {
  const rows = new Map();
  const createIndex = jest.fn(async () => 'native_provider_call_unique');
  const insertOne = jest.fn(async (record) => {
    if (rows.has(record.callKey) ||
        (record.nativeGraphSlotKey && [...rows.values()].some(
          (row) => row.nativeGraphSlotKey === record.nativeGraphSlotKey))) {
      const err = new Error('duplicate');
      err.code = 11000;
      throw err;
    }
    rows.set(record.callKey, structuredClone(record));
  });
  const findOne = jest.fn(async ({ callKey }) => structuredClone(rows.get(callKey) ?? null));
  const matches = (doc, query) =>
    Object.entries(query).every(([key, expected]) =>
      expected?.$in ? expected.$in.includes(doc[key]) : doc[key] === expected,
    );
  const findOneAndUpdate = jest.fn(async (query, update) => {
    const current = rows.get(query.callKey);
    if (!current || !matches(current, query)) return null;
    const next = { ...current, ...update.$set };
    rows.set(query.callKey, next);
    return structuredClone(next);
  });
  return { rows, createIndex, insertOne, findOne, findOneAndUpdate };
}
function create() {
  const collection = createCollection();
  const store = createNativeMissionProviderCallReceiptStore({ collection });
  const assertAuthorized = jest.fn().mockResolvedValue(undefined);
  const sendProvider = jest.fn().mockResolvedValue({ id: 'ci-response', text: 'ok' });
  const broker = createNativeMissionProviderCallBroker({ store, sendProvider, assertAuthorized });
  return { collection, store, assertAuthorized, sendProvider, broker };
}

describe('durable model request owner - no automatic replay', () => {
  it('prepares immutable request identity and rejects changed request digest', async () => {
    const { store, collection } = create();
    await expect(store.prepare(scope)).resolves.toMatchObject({ status: 'prepared' });
    await expect(store.prepare(scope)).resolves.toMatchObject({ status: 'prepared' });
    expect(collection.rows.size).toBe(1);
    await expect(
      store.prepare({ ...scope, requestDigest: digest('changed-prompt') }),
    ).rejects.toThrow('NATIVE_PROVIDER_CALL_IMMUTABLE_CONFLICT');
  });

  it('executes one provider call despite concurrent contenders on the same attempt', async () => {
    const { broker, sendProvider, store, collection } = create();
    let release;
    const waiting = new Promise((resolve) => {
      release = resolve;
    });
    sendProvider.mockImplementation(async () => {
      await waiting;
      return { text: 'completed once' };
    });
    const first = broker.execute({ ...scope, authorizedRequest: { path: 'fixture' } });
    const second = broker.execute({ ...scope, authorizedRequest: { path: 'fixture' } });
    await new Promise((resolve) => setImmediate(resolve));
    expect(sendProvider).toHaveBeenCalledTimes(1);
    const record = [...collection.rows.values()][0];
    expect(record.status).toBe('dispatched');
    expect(record.responseJson).toBeUndefined();
    release();
    const results = await Promise.all([first, second]);
    expect(results.some((value) => value.status === 'result_committed')).toBe(true);
    expect((await store.read(scope)).response).toEqual({ text: 'completed once' });
    expect(sendProvider).toHaveBeenCalledTimes(1);
  });

  it('marks a failed or uncertain provider request and NEVER dispatches it again', async () => {
    const { broker, store, sendProvider } = create();
    sendProvider.mockRejectedValueOnce(new Error('connection lost after dispatch'));
    await expect(broker.execute({ ...scope, authorizedRequest: {} })).rejects.toThrow(
      'connection lost after dispatch',
    );
    await expect(store.read(scope)).resolves.toMatchObject({
      status: 'outcome_unknown',
      dispatched: true,
      response: null,
    });
    await expect(broker.execute({ ...scope, authorizedRequest: {} })).resolves.toMatchObject({
      status: 'outcome_unknown',
    });
    expect(sendProvider).toHaveBeenCalledTimes(1);
  });

  it('rejects stale owner commits and cannot double-dispatch after result', async () => {
    const { store } = create();
    await store.prepare(scope);
    const owner = await store.claim(scope);
    await store.dispatch({ ...scope, ownerToken: owner.ownerToken });
    await expect(
      store.commit({ ...scope, ownerToken: 'foreign-owner-token', response: {} }),
    ).rejects.toThrow('NATIVE_PROVIDER_CALL_STALE_OWNER_OR_PHASE');
    await store.commit({ ...scope, ownerToken: owner.ownerToken, response: { ok: true } });
    await expect(store.dispatch({ ...scope, ownerToken: owner.ownerToken })).rejects.toThrow(
      'NATIVE_PROVIDER_CALL_STALE_OWNER_OR_PHASE',
    );
    expect((await store.claim(scope)).accepted).toBe(false);
  });

  it('accepts only the original owner late result following an ambiguous timeout', async () => {
    const { store } = create();
    await store.prepare(scope);
    const owner = await store.claim(scope);
    await store.dispatch({ ...scope, ownerToken: owner.ownerToken });
    await store.markUnknown({ ...scope, ownerToken: owner.ownerToken });
    await store.commit({ ...scope, ownerToken: owner.ownerToken, response: { ok: true } });
    await expect(store.read(scope)).resolves.toMatchObject({
      status: 'result_committed',
      response: { ok: true },
    });
    expect((await store.claim(scope)).accepted).toBe(false);
  });

  it('cannot execute when authorization is denied, including a second pre-dispatch check', async () => {
    const { broker, assertAuthorized, sendProvider, store } = create();
    assertAuthorized.mockRejectedValueOnce(new Error('ACL revoked'));
    await expect(broker.execute({ ...scope, authorizedRequest: {} })).rejects.toThrow(
      'ACL revoked',
    );
    expect(sendProvider).not.toHaveBeenCalled();
    await expect(store.read(scope)).rejects.toThrow('NATIVE_PROVIDER_CALL_IMMUTABLE_CONFLICT');

    const test = create();
    test.assertAuthorized
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('budget revoked'));
    await expect(test.broker.execute({ ...scope, authorizedRequest: {} })).rejects.toThrow(
      'budget revoked',
    );
    expect(test.sendProvider).not.toHaveBeenCalled();
    await expect(test.store.read(scope)).resolves.toMatchObject({ status: 'claimed' });
  });

  it('detects tampered stored results rather than returning unverified model text', async () => {
    const { store, collection } = create();
    await store.prepare(scope);
    const owner = await store.claim(scope);
    await store.dispatch({ ...scope, ownerToken: owner.ownerToken });
    await store.commit({ ...scope, ownerToken: owner.ownerToken, response: { ok: true } });
    const row = [...collection.rows.values()][0];
    row.responseJson = '{"ok":false}';
    await expect(store.read(scope)).rejects.toThrow('NATIVE_PROVIDER_CALL_RESULT_INTEGRITY_FAILED');
  });

  it('refuses malformed identities, unbounded responses, and missing dependencies', async () => {
    const { store } = create();
    await expect(
      store.prepare({ ...scope, identity: { ...identity, tenantId: undefined } }),
    ).rejects.toThrow('NATIVE_PROVIDER_CALL_IDENTITY_INVALID');
    await expect(store.prepare({ ...scope, requestDigest: 'bad' })).rejects.toThrow(
      'NATIVE_PROVIDER_CALL_DIGEST_INVALID',
    );
    await store.prepare(scope);
    const owner = await store.claim(scope);
    await store.dispatch({ ...scope, ownerToken: owner.ownerToken });
    await expect(
      store.commit({ ...scope, ownerToken: owner.ownerToken, response: 'x'.repeat(2_100_000) }),
    ).rejects.toThrow('NATIVE_PROVIDER_CALL_RESULT_INVALID');
    expect(() => createNativeMissionProviderCallBroker({ store, sendProvider: () => {} })).toThrow(
      'NATIVE_PROVIDER_BROKER_DEPENDENCIES_MISSING',
    );
  });
});


describe('direct native graph model-operation identities', () => {
  const direct = {
    mode: 'native_graph',
    userId: 'user-1',
    tenantId: 'tenant-1',
    streamId: 'original-conversation',
    responseMessageId: 'original-response',
    generationCreatedAt: 1700000000000,
    checkpointNamespace: '1700000000000',
    graphCheckpointId: 'original-graph-checkpoint',
    nodeId: 'mission/analysis',
    taskId: 'mission/analysis-task',
    agentId: 'specialist-analysis',
    provider: 'local-fixture',
    model: 'ci-free',
    operationKey: digest('original-native-node-operation'),
  };
  const directScope = {
    identity: direct,
    requestDigest: digest('original-native-node-request'),
  };

  it('commits once when the original native node has concurrent broker requests', async () => {
    const { broker, store, sendProvider, collection } = create();
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    sendProvider.mockImplementation(async () => {
      await pending;
      return { choices: [{ message: { content: 'original result' } }] };
    });
    const first = broker.execute({ ...directScope, authorizedRequest: {} });
    const second = broker.execute({ ...directScope, authorizedRequest: {} });
    await new Promise((resolve) => setImmediate(resolve));
    expect(sendProvider).toHaveBeenCalledTimes(1);
    expect(collection.rows.size).toBe(1);
    release();
    await Promise.all([first, second]);
    expect((await store.read(directScope)).response.choices[0].message.content)
      .toBe('original result');
    await broker.execute({ ...directScope, authorizedRequest: {} });
    expect(sendProvider).toHaveBeenCalledTimes(1);
  });

  it('fences every native model operation to the original generation and checkpoint', async () => {
    const { store } = create();
    await store.prepare(directScope);
    for (const patch of [
      { generationCreatedAt: direct.generationCreatedAt + 1 },
      { checkpointNamespace: 'later-generation' },
      { graphCheckpointId: 'different-head' },
      { nodeId: 'mission/research' },
      { taskId: 'mission/research-task' },
      { agentId: 'other-agent' },
      { provider: 'other-provider' },
      { model: 'other-model' },
      { streamId: 'other-conversation' },
    ]) {
      await expect(store.read({
        ...directScope,
        identity: { ...direct, ...patch },
      })).rejects.toThrow('NATIVE_PROVIDER_CALL_IMMUTABLE_CONFLICT');
    }
    await expect(store.prepare({
      ...directScope,
      identity: { ...direct, generationCreatedAt: '1700000000000' },
    })).rejects.toThrow('NATIVE_PROVIDER_CALL_IDENTITY_INVALID');
    await expect(store.prepare({
      ...directScope,
      identity: { ...direct, childThreadId: 'forged-detached-child' },
    })).rejects.toThrow('NATIVE_PROVIDER_CALL_IDENTITY_INVALID');
    await expect(store.prepare({
      ...directScope,
      identity: { ...identity, mode: 'native_graph' },
    })).rejects.toThrow('NATIVE_PROVIDER_CALL_IDENTITY_INVALID');
  });

  it('refuses a second provider reservation for the same original graph step', async () => {
    const { store, collection } = create();
    await store.prepare(directScope);
    const otherOperation = {
      ...directScope,
      identity: { ...direct, operationKey: digest('new-operation-after-crash') },
    };
    await expect(store.prepare(otherOperation)).rejects.toThrow(
      'NATIVE_PROVIDER_CALL_IMMUTABLE_CONFLICT',
    );
    await expect(store.prepare({
      ...directScope, requestDigest: digest('changed-model-request-after-crash'),
    })).rejects.toThrow('NATIVE_PROVIDER_CALL_IMMUTABLE_CONFLICT');
    await expect(store.prepare({
      ...directScope,
      identity: { ...direct, model: 'different-model' },
    })).rejects.toThrow('NATIVE_PROVIDER_CALL_IMMUTABLE_CONFLICT');
    await expect(store.prepare({
      ...directScope,
      identity: { ...direct, agentId: 'replacement-agent' },
    })).rejects.toThrow('NATIVE_PROVIDER_CALL_IMMUTABLE_CONFLICT');
    expect(collection.rows.size).toBe(1);
  });

  it('preserves detached child identity and never aliases it with a graph node', async () => {
    const { store, collection } = create();
    await store.prepare(scope);
    await store.prepare(directScope);
    expect(collection.rows.size).toBe(2);
    expect((await store.read(scope)).callKey)
      .not.toBe((await store.read(directScope)).callKey);
  });
});
