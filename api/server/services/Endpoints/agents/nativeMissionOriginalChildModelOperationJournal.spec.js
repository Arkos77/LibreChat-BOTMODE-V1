'use strict';

const { createHash } = require('node:crypto');
const {
  createNativeMissionOriginalChildModelOperationJournal,
} = require('./nativeMissionOriginalChildModelOperationJournal');
const {
  createNativeMissionProviderCallReceiptStore,
} = require('./nativeMissionProviderCallReceiptStore');
const { createNativeMissionProviderCallBroker } = require('./nativeMissionProviderCallBroker');
const { requestDigest } = require('./nativeMissionProviderBrokerHttp');
const {
  createNativeMissionDetachedBrokerModelFetchFactory,
} = require('./nativeMissionProviderBrokerModelFetch');

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
    if (
      rows.has(doc.callKey) ||
      (doc.originalSlotKey != null &&
        [...rows.values()].some((r) => r.originalSlotKey === doc.originalSlotKey))
    ) {
      const e = new Error('duplicate');
      e.code = 11000;
      throw e;
    }
    rows.set(doc.callKey, structuredClone(doc));
  });
  const findOne = jest.fn(async (query) =>
    structuredClone(
      (query.callKey
        ? rows.get(query.callKey)
        : [...rows.values()].find((row) => row.originalSlotKey === query.originalSlotKey)) ?? null,
    ),
  );
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
    expect(record.operationKey).toBe(identity.operationKey);
    expect(record.requestDigest).toBe(start.requestDigest);
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

  it('reserves the original graph step exactly once before any model effect', async () => {
    const graph = {
      graphThreadId:
        'subagent:' +
        Buffer.from(
          JSON.stringify([
            identity.parentConversationId,
            'parent-fork'.repeat(12),
            'worker',
            start.parentToolCallId,
            'batch'.repeat(15),
            'resume-attempt',
          ]),
        ).toString('base64url'),
      checkpointNs: '',
      generationNamespace: 'original-generation',
    };
    expect(graph.graphThreadId.length).toBeGreaterThan(256);
    const fresh = {
      identity: Object.fromEntries(
        Object.entries(identity).filter(([field]) => field !== 'operationKey'),
      ),
      parentToolCallId: start.parentToolCallId,
      checkpointId: start.checkpointId,
      requestDigest: start.requestDigest,
      ...graph,
    };
    const { journal, collection } = setup({
      readOriginalCheckpoint: async () => ({
        checkpointId: start.checkpointId,
        taskId: identity.taskId,
        attemptKey: identity.attemptKey,
        childThreadId: identity.childThreadId,
        provider: identity.provider,
        model: identity.model,
        ...graph,
      }),
    });
    const [first, simultaneous] = await Promise.all([
      journal.reserveOriginal(fresh),
      journal.reserveOriginal(fresh),
    ]);
    expect(first.status).toBe('prepared');
    expect(first.operationKey).toMatch(/^[a-f0-9]{64}$/);
    expect(first.operationKey).toBe(simultaneous.operationKey);
    expect(first.callKey).toBe(simultaneous.callKey);
    expect(collection.rows.size).toBe(1);
    await expect(journal.reserveOriginal(fresh)).resolves.toEqual(first);
    await expect(
      journal.reserveOriginal({ ...fresh, graphThreadId: graph.graphThreadId + 'x'.repeat(3072) }),
    ).rejects.toThrow('NATIVE_ORIGINAL_MODEL_RESERVATION_INVALID');
    expect(collection.rows.size).toBe(1);
    await expect(
      journal.reserveOriginal({ ...fresh, requestDigest: digest('different-request') }),
    ).rejects.toThrow('NATIVE_ORIGINAL_MODEL_RESERVATION_CONFLICT');
    expect(collection.rows.size).toBe(1);
  });

  it('never reserves a provider call for an unproven original graph checkpoint', async () => {
    const graph = {
      graphThreadId: 'subagent:original-graph',
      checkpointNs: '',
      generationNamespace: 'original-generation',
    };
    const { journal, collection } = setup({
      readOriginalCheckpoint: async () => ({
        checkpointId: start.checkpointId,
        taskId: identity.taskId,
        attemptKey: identity.attemptKey,
        childThreadId: identity.childThreadId,
        provider: identity.provider,
        model: identity.model,
        ...graph,
        graphThreadId: 'subagent:foreign-graph',
      }),
    });
    await expect(
      journal.reserveOriginal({
        identity: Object.fromEntries(
          Object.entries(identity).filter(([field]) => field !== 'operationKey'),
        ),
        parentToolCallId: start.parentToolCallId,
        checkpointId: start.checkpointId,
        requestDigest: start.requestDigest,
        ...graph,
      }),
    ).rejects.toThrow('NATIVE_ORIGINAL_MODEL_JOURNAL_CHECKPOINT_DENIED');
    expect(collection.insertOne).not.toHaveBeenCalled();
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

  it('prepares an original child before provider IO and reuses the committed receipt after restart', async () => {
    const request = {
      model: identity.model,
      stream: false,
      messages: [{ role: 'user', content: 'bounded-original-task' }],
    };
    const originalDigest = requestDigest(request);
    const fixture = setup({
      readOriginalCheckpoint: async () => ({
        checkpointId: start.checkpointId,
        taskId: scope.taskId,
        attemptKey: scope.attemptKey,
        childThreadId: scope.childThreadId,
        provider: identity.provider,
        model: identity.model,
        operationKey: identity.operationKey,
        requestDigest: originalDigest,
      }),
    });
    const store = createNativeMissionProviderCallReceiptStore({ collection: fixture.collection });
    const sendProvider = jest.fn(async () => ({
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: { role: 'assistant', content: 'original-completion' },
        },
      ],
    }));
    const broker = createNativeMissionProviderCallBroker({
      store,
      sendProvider,
      assertAuthorized: async () => undefined,
    });
    const calls = [];
    const prepareOriginalOperation = jest.fn(async (args) =>
      fixture.journal.prepareOriginal({
        identity,
        parentToolCallId: args.scope.parentToolCallId,
        checkpointId: start.checkpointId,
        requestDigest: args.requestDigest,
      }),
    );
    const resolveOriginalOperation = jest.fn(async (args) => {
      const found = await fixture.journal.findOriginalOperations({
        ...args.scope,
        provider: args.provider,
        model: args.model,
        requestDigest: args.requestDigest,
      });
      if (found.length !== 1) throw new Error('ORIGINAL_OPERATION_MISSING');
      return {
        approved: true,
        scope: args.scope,
        provider: args.provider,
        model: args.model,
        requestDigest: args.requestDigest,
        operationKey: found[0].operationKey,
        checkpointId: found[0].checkpointId,
      };
    });
    let recoveryOnly = false;
    const endpoint = 'http://127.0.0.1:8088/v1/chat/completions';
    const factory = createNativeMissionDetachedBrokerModelFetchFactory({
      getExecutionScope: () => ({ ...scope, ...(recoveryOnly ? { recoveryOnly: true } : {}) }),
      resolveModelBinding: () => ({
        agentId: identity.agentId,
        provider: identity.provider,
        model: identity.model,
        endpoint,
      }),
      prepareOriginalOperation,
      resolveOriginalOperation,
      getOriginalCheckpointReference: () => ({
        threadId: 'subagent:original-graph',
        checkpointId: start.checkpointId,
        checkpointNs: '',
        generationNamespace: 'generation',
      }),
      brokerUrl: 'http://127.0.0.1:8095/',
      secret: 'isolated-mongo-proof-secret-at-least-32-chars',
      fetchImpl: async (url, init) => {
        const path = new URL(String(url)).pathname;
        calls.push(path);
        const payload = JSON.parse(init.body);
        const result =
          path === '/execute' ? await broker.execute(payload) : await store.read(payload);
        return new Response(JSON.stringify(result), { status: 200 });
      },
    });
    const modelFetch = factory({
      agentId: identity.agentId,
      provider: identity.provider,
      model: identity.model,
    });
    const reply = await modelFetch(endpoint, { method: 'POST', body: JSON.stringify(request) });
    expect((await reply.json()).choices[0].message.content).toBe('original-completion');
    expect(calls).toEqual(['/execute']);
    expect(sendProvider).toHaveBeenCalledTimes(1);
    expect(prepareOriginalOperation).toHaveBeenCalledTimes(1);
    expect(resolveOriginalOperation).toHaveBeenCalledTimes(1);
    expect(fixture.collection.rows.size).toBe(1);

    // Recreate the fetch with the original persisted task scope, not a new
    // tool call or provider request. The broker result lives in the same Mongo
    // row; a recovery-only fetch must not create or dispatch another call.
    recoveryOnly = true;
    calls.length = 0;
    const recovered = await modelFetch(endpoint, { method: 'POST', body: JSON.stringify(request) });
    expect((await recovered.json()).choices[0].message.content).toBe('original-completion');
    expect(calls).toEqual(['/status']);
    expect(sendProvider).toHaveBeenCalledTimes(1);
    expect(prepareOriginalOperation).toHaveBeenCalledTimes(1);
    expect(resolveOriginalOperation).toHaveBeenCalledTimes(2);
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
