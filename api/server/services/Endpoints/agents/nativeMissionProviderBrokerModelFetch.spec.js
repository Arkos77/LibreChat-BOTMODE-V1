'use strict';

const { createHash } = require('node:crypto');
const { createNativeMissionBrokerModelFetch } = require('./nativeMissionProviderBrokerModelFetch');

const secret = 'ci-limited-transport-secret-with-32-plus-chars';
const endpoint = 'http://127.0.0.1:8088/v1/chat/completions';
const scope = Object.freeze({
  userId: 'ci-user',
  tenantId: 'ci-tenant',
  parentConversationId: 'ci-parent',
  parentRunId: 'ci-parent-response',
  parentToolCallId: 'ci-original-tool',
  childThreadId: 'ci-original-child',
  taskId: 'ci-native-task',
  attemptKey: 'ci-original-attempt',
  agentId: 'ci-original-specialist',
});
const operationKey = createHash('sha256').update('durable-prepared-model-operation').digest('hex');
const body = JSON.stringify({
  model: 'ci-free',
  stream: false,
  messages: [{ role: 'user', content: 'ci-model-test' }],
});
const final = {
  id: 'chatcmpl-ci',
  object: 'chat.completion',
  choices: [{ index: 0, message: { role: 'assistant', content: 'ci-receipt' } }],
};

function setup(overrides = {}) {
  const calls = [];
  const getScope = jest.fn(() => scope);
  const resolveOriginalOperation = jest.fn(async (args) => ({
    approved: true,
    scope,
    provider: 'ci-local-fixture',
    model: 'ci-free',
    requestDigest: args.requestDigest,
    operationKey,
  }));
  const fetchImpl = jest.fn(async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(
      JSON.stringify({ status: 'result_committed', resultAvailable: true, response: final }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });
  const fetchModel = createNativeMissionBrokerModelFetch({
    getScope,
    resolveOriginalOperation,
    originalProvider: 'ci-local-fixture',
    originalModel: 'ci-free',
    originalModelEndpoint: endpoint,
    brokerUrl: 'http://127.0.0.1:8095/',
    secret,
    fetchImpl,
    pause: async () => {},
    ...overrides,
  });
  return { fetchModel, getScope, resolveOriginalOperation, fetchImpl, calls };
}

describe('native model transport via durable provider broker (not installed automatically)', () => {
  it('intercepts the original approved model fetch without contacting the provider', async () => {
    const { fetchModel, calls, resolveOriginalOperation } = setup();
    const response = await fetchModel(endpoint, {
      method: 'POST',
      body,
      headers: { Authorization: 'Bearer secret-that-must-not-leak' },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(final);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://127.0.0.1:8095/execute');
    expect(calls[0].options.headers.Authorization).toBeUndefined();
    const payload = JSON.parse(calls[0].options.body);
    expect(payload.identity).toMatchObject({
      taskId: scope.taskId,
      attemptKey: scope.attemptKey,
      parentRunId: scope.parentRunId,
      childThreadId: scope.childThreadId,
      operationKey,
    });
    expect(payload.authorizedRequest.messages).toEqual(JSON.parse(body).messages);
    expect(resolveOriginalOperation).toHaveBeenCalledWith(
      expect.objectContaining({ scope, provider: 'ci-local-fixture', model: 'ci-free' }),
    );
  });

  it('waits for a committed receipt using status reads only (never resends execute)', async () => {
    const { fetchModel, fetchImpl, calls } = setup();
    const replies = [
      { status: 'dispatched', resultAvailable: false },
      { status: 'result_committed', resultAvailable: true, response: final },
    ];
    fetchImpl.mockImplementation(async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify(replies.shift()), { status: 200 });
    });
    await expect(fetchModel(endpoint, { method: 'POST', body })).resolves.toBeInstanceOf(Response);
    expect(calls.map((x) => x.url)).toEqual([
      'http://127.0.0.1:8095/execute',
      'http://127.0.0.1:8095/status',
    ]);
  });

  it('refuses missing native execution context before broker network I/O', async () => {
    const { fetchModel, fetchImpl } = setup({ getScope: () => undefined });
    await expect(fetchModel(endpoint, { method: 'POST', body })).rejects.toThrow(
      'NATIVE_BROKER_FETCH_NO_ORIGINAL_CHILD',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses altered original authorization, context, or operation key', async () => {
    for (const difference of [
      { approved: false },
      { scope: { ...scope, parentToolCallId: 'foreign-tool' } },
      { model: 'wrong-model' },
      { operationKey: 'not-durable' },
    ]) {
      const { fetchModel, fetchImpl } = setup({
        resolveOriginalOperation: async (args) => ({
          approved: true,
          scope,
          model: 'ci-free',
          provider: 'ci-local-fixture',
          requestDigest: args.requestDigest,
          operationKey,
          ...difference,
        }),
      });
      await expect(fetchModel(endpoint, { method: 'POST', body })).rejects.toThrow(
        'NATIVE_BROKER_FETCH_OPERATION_UNVERIFIED',
      );
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });

  it('rejects streaming, tool effects, different models, or alternative endpoints', async () => {
    const { fetchModel, fetchImpl } = setup();
    for (const change of [
      { stream: true },
      { tools: [{ type: 'function' }] },
      { model: 'other-model' },
    ]) {
      await expect(
        fetchModel(endpoint, {
          method: 'POST',
          body: JSON.stringify({ ...JSON.parse(body), ...change }),
        }),
      ).rejects.toThrow('NATIVE_BROKER_FETCH_UNSUPPORTED_MODEL_EFFECT');
    }
    await expect(
      fetchModel('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        body,
      }),
    ).rejects.toThrow('NATIVE_BROKER_FETCH_MODEL_ENDPOINT_MISMATCH');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed on ambiguous outcome, unavailable broker or missing committed content', async () => {
    for (const result of [
      { status: 'outcome_unknown', resultAvailable: false },
      { status: 'result_committed', resultAvailable: true },
      { status: 'result_committed', resultAvailable: true, response: { wrong: true } },
    ]) {
      const { fetchModel, fetchImpl } = setup();
      fetchImpl.mockImplementation(
        async () => new Response(JSON.stringify(result), { status: 200 }),
      );
      await expect(fetchModel(endpoint, { method: 'POST', body })).rejects.toThrow(
        'NATIVE_BROKER_FETCH_RESULT_NOT_PROVEN',
      );
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it('refuses provider endpoint changes and missing secure broker credentials', () => {
    expect(() => setup({ brokerUrl: 'https://external.example/' })).toThrow(
      'NATIVE_BROKER_FETCH_ENDPOINT_DENIED',
    );
    expect(() => setup({ secret: 'bad' })).toThrow('NATIVE_BROKER_FETCH_DEPENDENCIES_INVALID');
  });

  it('does not invent a new operation or retransmit after bounded pending status', async () => {
    const { fetchModel, calls, fetchImpl } = setup({ maxPolls: 2 });
    fetchImpl.mockImplementation(async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify({ status: 'dispatched', resultAvailable: false }), {
        status: 200,
      });
    });
    await expect(fetchModel(endpoint, { method: 'POST', body })).rejects.toThrow(
      'NATIVE_BROKER_FETCH_RESULT_NOT_PROVEN',
    );
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(['/execute', '/status', '/status']);
  });
});
