'use strict';

const { createHash } = require('node:crypto');
const {
  createNativeMissionOriginalChildModelOperationJournal,
} = require('./nativeMissionOriginalChildModelOperationJournal');
const {
  createNativeMissionProviderCallReceiptStore,
} = require('./nativeMissionProviderCallReceiptStore');
const { createNativeMissionProviderCallBroker } = require('./nativeMissionProviderCallBroker');

const digest = (s) => createHash('sha256').update(s).digest('hex');
const identity = Object.freeze({
  userId: 'user',
  tenantId: 'tenant',
  parentConversationId: 'parent',
  parentRunId: 'parent-response',
  childThreadId: 'child',
  taskId: 'task-one',
  attemptKey: 'original-attempt',
  agentId: 'research-agent',
  provider: 'ci-fixture',
  model: 'free-ci',
  operationKey: digest('saved-original-checkpoint-operation'),
});
const start = Object.freeze({
  identity,
  parentToolCallId: 'tool-parent',
  checkpointId: 'saved-checkpoint',
  requestDigest: digest('canonical-original-model-request'),
});
const originFingerprint = digest('immutable-mission-origin');
const scope = Object.freeze({
  userId: identity.userId,
  tenantId: identity.tenantId,
  parentConversationId: identity.parentConversationId,
  parentRunId: identity.parentRunId,
  parentToolCallId: start.parentToolCallId,
  childThreadId: identity.childThreadId,
  taskId: identity.taskId,
  attemptKey: identity.attemptKey,
  agentId: identity.agentId,
});

function mockMongo() {
  const rows = new Map();
  const createIndex = jest.fn(async () => 'native_provider_call_unique');
  const insertOne = jest.fn(async (doc) => {
    if (rows.has(doc.callKey)) {
      const e = new Error('duplicate');
      e.code = 11000;
      throw e;
    }
    rows.set(doc.callKey, structuredClone(doc));
  });
  const findOne = jest.fn(async (query) => structuredClone(rows.get(query.callKey) ?? null));
  const findOneAndUpdate = jest.fn(async (filter, update) => {
    const current = rows.get(filter.callKey);
    if (
      !current ||
      Object.entries(filter).some(([key, expected]) =>
        expected?.$in ? !expected.$in.includes(current[key]) : current[key] !== expected,
      )
    ) {
      return null;
    }
    const next = { ...current, ...update.$set };
    rows.set(filter.callKey, next);
    return structuredClone(next);
  });
  const find = jest.fn((query) => ({
    limit: (max) => ({
      toArray: async () =>
        [...rows.values()]
          .filter((row) =>
            Object.entries(query).every(([field, wanted]) =>
              wanted?.$type === 'string' ? typeof row[field] === 'string' : row[field] === wanted,
            ),
          )
          .slice(0, max)
          .map((row) => structuredClone(row)),
    }),
  }));
  return { rows, createIndex, insertOne, findOne, findOneAndUpdate, find };
}
function setup(changes = {}) {
  const collection = mockMongo();
  const authorizeOriginal = jest.fn(async (input) => ({
    approved: true,
    scope,
    provider: input.provider,
    model: input.model,
    operationKey: input.operationKey,
    checkpointId: input.checkpointId,
    requestDigest: input.requestDigest,
    originFingerprint,
  }));
  const readOriginalCheckpoint = jest.fn(async () => ({
    checkpointId: start.checkpointId,
    taskId: scope.taskId,
    attemptKey: scope.attemptKey,
    childThreadId: scope.childThreadId,
    provider: identity.provider,
    model: identity.model,
    operationKey: identity.operationKey,
    requestDigest: start.requestDigest,
  }));
  const deps = { collection, authorizeOriginal, readOriginalCheckpoint, ...changes };
  return {
    ...deps,
    journal: createNativeMissionOriginalChildModelOperationJournal(deps),
  };
}
const query = {
  ...scope,
  provider: identity.provider,
  model: identity.model,
  requestDigest: start.requestDigest,
};

describe('private Mongo journal for original child model operation', () => {
  it('writes a unique original checkpointed operation before any provider dispatch', async () => {
    const { journal, collection, authorizeOriginal } = setup();
    const record = await journal.prepareOriginal(start);
    expect(record.status).toBe('prepared');
    expect(Object.isFrozen(record)).toBe(true);
    expect(collection.rows.size).toBe(1);
    const [stored] = collection.rows.values();
    expect(stored).toMatchObject({
      operationKey: identity.operationKey,
      requestDigest: start.requestDigest,
      checkpointId: start.checkpointId,
      parentToolCallId: start.parentToolCallId,
      originFingerprint,
      status: 'prepared',
    });
    expect(stored.ownerToken).toBeUndefined();
    expect(stored.responseJson).toBeUndefined();
    expect(authorizeOriginal).toHaveBeenCalledTimes(2);
    await expect(journal.findOriginalOperations(query)).resolves.toEqual([
      expect.objectContaining({
        parentRunId: identity.parentRunId,
        childThreadId: identity.childThreadId,
        operationKey: identity.operationKey,
        originFingerprint,
      }),
    ]);
  });

  it('accepts a duplicate only with exactly the same immutable operation and checkpoint', async () => {
    const { journal, collection } = setup();
    await journal.prepareOriginal(start);
    await journal.prepareOriginal(start);
    expect(collection.rows.size).toBe(1);
    await expect(
      journal.prepareOriginal({ ...start, checkpointId: 'different-checkpoint' }),
    ).rejects.toThrow('NATIVE_ORIGINAL_MODEL_JOURNAL_CHECKPOINT_DENIED');
    expect(collection.rows.size).toBe(1);
  });

  it('refuses authorization failure before even allocating an operation row', async () => {
    const { journal, collection } = setup({
      authorizeOriginal: jest.fn(async () => ({ approved: false })),
    });
    await expect(journal.prepareOriginal(start)).rejects.toThrow(
      'NATIVE_ORIGINAL_MODEL_JOURNAL_AUTHORITY_DENIED',
    );
    expect(collection.insertOne).not.toHaveBeenCalled();
  });

  it('refuses a missing or altered original graph checkpoint', async () => {
    const { journal, collection } = setup({
      readOriginalCheckpoint: jest.fn(async () => ({
        checkpointId: start.checkpointId,
        taskId: identity.taskId,
        attemptKey: 'other-attempt',
      })),
    });
    await expect(journal.prepareOriginal(start)).rejects.toThrow(
      'NATIVE_ORIGINAL_MODEL_JOURNAL_CHECKPOINT_DENIED',
    );
    expect(collection.rows.size).toBe(0);
  });

  it('detects a conflicting original mission fingerprint on duplicate insert', async () => {
    const { journal, collection, authorizeOriginal } = setup();
    await journal.prepareOriginal(start);
    authorizeOriginal.mockImplementation(async (input) => ({
      approved: true,
      scope,
      provider: input.provider,
      model: input.model,
      operationKey: input.operationKey,
      requestDigest: input.requestDigest,
      checkpointId: input.checkpointId,
      originFingerprint: digest('different-original-mission'),
    }));
    await expect(journal.prepareOriginal(start)).rejects.toThrow(
      'NATIVE_ORIGINAL_MODEL_JOURNAL_IMMUTABLE_CONFLICT',
    );
    expect(collection.rows.size).toBe(1);
  });

  it('rejects authority revocation after first insert and never dispatches', async () => {
    const auth = jest
      .fn()
      .mockImplementationOnce(async (input) => ({
        approved: true,
        scope,
        provider: input.provider,
        model: input.model,
        operationKey: input.operationKey,
        requestDigest: input.requestDigest,
        checkpointId: input.checkpointId,
        originFingerprint,
      }))
      .mockResolvedValue({ approved: false });
    const { journal, collection } = setup({ authorizeOriginal: auth });
    await expect(journal.prepareOriginal(start)).rejects.toThrow(
      'NATIVE_ORIGINAL_MODEL_JOURNAL_AUTHORITY_DENIED',
    );
    expect(collection.rows.size).toBe(1);
    expect([...collection.rows.values()][0].status).toBe('prepared');
  });

  it('refuses an untrusted operation key, digest, or missing task/tenant identity', async () => {
    const { journal, collection } = setup();
    for (const change of [
      { identity: { ...identity, operationKey: 'guess' } },
      { requestDigest: 'not-a-digest' },
      { identity: { ...identity, userId: '' } },
      { parentToolCallId: '' },
    ]) {
      await expect(journal.prepareOriginal({ ...start, ...change })).rejects.toThrow(
        /NATIVE_ORIGINAL_MODEL_JOURNAL_(IDENTITY_INVALID|PROOF_INVALID)/,
      );
    }
    expect(collection.rows.size).toBe(0);
  });

  it('returns at most two operations to force ambiguity denial on identical model requests', async () => {
    const { journal, collection } = setup();
    await journal.prepareOriginal(start);
    const clone = structuredClone([...collection.rows.values()][0]);
    clone.callKey = digest('second-distinct-operation');
    clone.operationKey = digest('new-operation-of-same-input');
    clone.identity.operationKey = clone.operationKey;
    clone.checkpointId = 'new-saved-checkpoint';
    collection.rows.set(clone.callKey, clone);
    const rows = await journal.findOriginalOperations(query);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.operationKey)).size).toBe(2);
    expect(collection.find).toHaveBeenCalledWith(
      expect.objectContaining({ attemptKey: scope.attemptKey, requestDigest: start.requestDigest }),
    );
  });

  it('uses the exact same prepared Mongo operation with the independent broker', async () => {
    const { journal, collection } = setup();
    const prepared = await journal.prepareOriginal(start);
    const ownerStore = createNativeMissionProviderCallReceiptStore({ collection });
    const sendProvider = jest.fn(async () => ({
      choices: [{ message: { role: 'assistant', content: 'original-call-only' } }],
    }));
    const broker = createNativeMissionProviderCallBroker({
      store: ownerStore,
      sendProvider,
      assertAuthorized: async () => undefined,
    });
    const payload = {
      identity,
      requestDigest: start.requestDigest,
      authorizedRequest: { model: 'free-ci', messages: [] },
    };
    const [a, b] = await Promise.all([broker.execute(payload), broker.execute(payload)]);
    expect(sendProvider).toHaveBeenCalledTimes(1);
    expect(a.callKey).toBe(prepared.callKey);
    expect(b.callKey).toBe(prepared.callKey);
    expect(collection.rows.size).toBe(1);
    expect([...collection.rows.values()][0]).toMatchObject({
      checkpointId: start.checkpointId,
      originFingerprint,
      status: 'result_committed',
    });
    expect((await ownerStore.read(payload)).response).toMatchObject({
      choices: [{ message: { content: 'original-call-only' } }],
    });
    await expect(journal.findOriginalOperations(query)).resolves.toEqual([
      expect.objectContaining({
        operationKey: identity.operationKey,
        status: 'result_committed',
      }),
    ]);
    const later = await broker.execute(payload);
    expect(later.status).toBe('result_committed');
    expect(sendProvider).toHaveBeenCalledTimes(1);
  });

  it('does not accept foreign tenant or a missing Mongo query adapter', async () => {
    const { journal } = setup();
    await expect(journal.findOriginalOperations({ ...query, tenantId: undefined })).rejects.toThrow(
      'NATIVE_ORIGINAL_MODEL_JOURNAL_QUERY_INVALID',
    );
    expect(() =>
      createNativeMissionOriginalChildModelOperationJournal({
        collection: { findOne: () => null },
        authorizeOriginal: async () => true,
        readOriginalCheckpoint: async () => null,
      }),
    ).toThrow('NATIVE_ORIGINAL_MODEL_JOURNAL_DEPENDENCIES');
  });
});
