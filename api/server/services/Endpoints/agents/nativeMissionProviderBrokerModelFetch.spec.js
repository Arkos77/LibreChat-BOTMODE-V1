'use strict';

const { createHash } = require('node:crypto');
const {
  createNativeMissionBrokerModelFetch,
  createNativeMissionDetachedBrokerModelFetchFactory,
} = require('./nativeMissionProviderBrokerModelFetch');

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

  it('recovered native child never invokes /execute, even with a valid original grant', async () => {
    const { fetchModel, calls, fetchImpl } = setup({
      getScope: () => ({ ...scope, recoveryOnly: true }),
    });
    const response = await fetchModel(endpoint, { method: 'POST', body });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(final);
    expect(calls.map((request) => new URL(request.url).pathname)).toEqual(['/status']);
    expect(JSON.parse(calls[0].options.body).authorizedRequest).toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('recovered child cannot dispatch when the original status is not terminal', async () => {
    const { fetchModel, fetchImpl, calls } = setup({
      getScope: () => ({ ...scope, recoveryOnly: true }),
      maxPolls: 1,
    });
    fetchImpl.mockImplementation(async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify({ status: 'prepared', resultAvailable: false }), {
        status: 200,
      });
    });
    await expect(fetchModel(endpoint, { method: 'POST', body })).rejects.toThrow(
      'NATIVE_BROKER_FETCH_RESULT_NOT_PROVEN',
    );
    expect(calls.map((request) => new URL(request.url).pathname)).toEqual(['/status', '/status']);
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

  it('returns the single committed text completion as OpenAI SSE without a second provider call', async () => {
    const { fetchModel, fetchImpl, calls, resolveOriginalOperation } = setup();
    const committed = {
      ...final,
      created: 100,
      choices: [
        { index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'ci-receipt' } },
      ],
      usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
    };
    fetchImpl.mockImplementation(async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(
        JSON.stringify({ status: 'result_committed', resultAvailable: true, response: committed }),
        { status: 200 },
      );
    });
    const streamingBody = JSON.stringify({
      ...JSON.parse(body),
      stream: true,
      stream_options: { include_usage: true },
    });
    const response = await fetchModel(endpoint, { method: 'POST', body: streamingBody });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    const data = await response.text();
    expect(data).toContain('"delta":{"role":"assistant","content":"ci-receipt"}');
    expect(data).toContain('"finish_reason":"stop"');
    expect(data).toContain('"total_tokens":6');
    expect(data).toContain('data: [DONE]');
    expect(calls.map((x) => x.url)).toEqual(['http://127.0.0.1:8095/execute']);
    const submitted = JSON.parse(calls[0].options.body);
    expect(submitted.authorizedRequest.stream).toBe(false);
    expect(submitted.authorizedRequest.stream_options).toBeUndefined();
    expect(resolveOriginalOperation).toHaveBeenCalledTimes(1);
  });

  it('refuses converting a committed tool call or nonterminal reply into synthetic SSE', async () => {
    for (const finish_reason of ['tool_calls', 'length']) {
      const { fetchModel, fetchImpl, calls } = setup();
      fetchImpl.mockImplementation(async (url, options) => {
        calls.push({ url: String(url), options });
        return new Response(
          JSON.stringify({
            status: 'result_committed',
            resultAvailable: true,
            response: {
              ...final,
              choices: [
                {
                  index: 0,
                  finish_reason,
                  message: { role: 'assistant', content: 'ci-receipt' },
                },
              ],
            },
          }),
          { status: 200 },
        );
      });
      await expect(
        fetchModel(endpoint, {
          method: 'POST',
          body: JSON.stringify({ ...JSON.parse(body), stream: true }),
        }),
      ).rejects.toThrow('NATIVE_BROKER_FETCH_STREAM_RESULT_UNSUPPORTED');
      expect(calls).toHaveLength(1);
    }
  });

  it('rejects tool effects, multiple choices, different models, or alternative endpoints', async () => {
    const { fetchModel, fetchImpl } = setup();
    for (const change of [{ n: 2 }, { tools: [{ type: 'function' }] }, { model: 'other-model' }]) {
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

describe('original detached-child host binding via real execution context', () => {
  const checkpointId = 'durable-original-sdk-checkpoint';
  const binding = Object.freeze({
    agentId: scope.agentId,
    provider: 'ci-local-fixture',
    model: 'ci-free',
  });

  function host(overrides = {}) {
    const calls = [];
    const fetchImpl = jest.fn(async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(
        JSON.stringify({ status: 'result_committed', resultAvailable: true, response: final }),
        { status: 200 },
      );
    });
    const prepareOriginalOperation = jest.fn(async (args) => ({
      status: 'prepared',
      checkpointId,
      operationKey,
      requestDigest: args.requestDigest,
    }));
    const resolveOriginalOperation = jest.fn(async (args) => ({
      approved: true,
      scope,
      provider: binding.provider,
      model: binding.model,
      requestDigest: args.requestDigest,
      operationKey,
      checkpointId,
    }));
    const factory = createNativeMissionDetachedBrokerModelFetchFactory({
      getExecutionScope: () => scope,
      resolveModelBinding: () => ({ ...binding, endpoint }),
      resolveOriginalOperation,
      prepareOriginalOperation,
      brokerUrl: 'http://127.0.0.1:8095/',
      secret,
      fetchImpl,
      ...overrides,
    });
    return { factory, fetchImpl, resolveOriginalOperation, prepareOriginalOperation, calls };
  }

  it('binds the model only when the trusted host and original child identity agree', async () => {
    const { factory, calls, resolveOriginalOperation, prepareOriginalOperation } = host();
    const fetchModel = factory(binding);
    const response = await fetchModel(endpoint, { method: 'POST', body });
    expect(await response.json()).toEqual(final);
    expect(calls.map((call) => call.url)).toEqual(['http://127.0.0.1:8095/execute']);
    expect(resolveOriginalOperation).toHaveBeenCalledWith(
      expect.objectContaining({ scope, provider: binding.provider, model: binding.model }),
    );
    expect(prepareOriginalOperation).toHaveBeenCalledWith(
      expect.objectContaining({ scope, provider: binding.provider, model: binding.model }),
    );
    expect(prepareOriginalOperation.mock.invocationCallOrder[0]).toBeLessThan(
      resolveOriginalOperation.mock.invocationCallOrder[0],
    );
  });

  it('rejects a sibling child identity before any journal or broker IO', async () => {
    const { factory, fetchImpl, resolveOriginalOperation } = host({
      getExecutionScope: () => ({ ...scope, agentId: 'other-child' }),
    });
    const fetchModel = factory(binding);
    await expect(fetchModel(endpoint, { method: 'POST', body })).rejects.toThrow(
      'NATIVE_BROKER_HOST_CHILD_IDENTITY_MISMATCH',
    );
    expect(resolveOriginalOperation).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses an unknown or changed agent-model binding without direct provider fallback', () => {
    for (const fake of [
      { ...binding, model: 'changed-model' },
      { ...binding, agentId: 'foreign-child' },
    ]) {
      const { factory, fetchImpl } = host();
      expect(() => factory(fake)).toThrow('NATIVE_BROKER_HOST_MODEL_UNAUTHORIZED');
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });

  it('keeps recovered child requests read-only at the broker', async () => {
    const { factory, calls, prepareOriginalOperation } = host({
      getExecutionScope: () => ({ ...scope, recoveryOnly: true }),
    });
    const result = await factory(binding)(endpoint, { method: 'POST', body });
    expect(result.status).toBe(200);
    expect(calls.map((call) => new URL(call.url).pathname)).toEqual(['/status']);
    expect(prepareOriginalOperation).not.toHaveBeenCalled();
  });

  it('refuses a failed pre-dispatch Mongo write without provider/network IO', async () => {
    const { factory, fetchImpl, resolveOriginalOperation } = host({
      prepareOriginalOperation: async () => {
        throw new Error('NATIVE_ORIGINAL_MODEL_JOURNAL_CHECKPOINT_DENIED');
      },
    });
    await expect(factory(binding)(endpoint, { method: 'POST', body })).rejects.toThrow(
      'NATIVE_ORIGINAL_MODEL_JOURNAL_CHECKPOINT_DENIED',
    );
    expect(resolveOriginalOperation).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a mismatched durable checkpoint or operation key before dispatch', async () => {
    for (const mismatch of [
      { operationKey: createHash('sha256').update('foreign').digest('hex') },
      { checkpointId: 'foreign-checkpoint' },
      { requestDigest: 'f'.repeat(64) },
      { status: 'not-persisted' },
    ]) {
      const { factory, fetchImpl } = host({
        prepareOriginalOperation: async (args) => ({
          status: 'prepared',
          checkpointId,
          operationKey,
          requestDigest: args.requestDigest,
          ...mismatch,
        }),
      });
      await expect(factory(binding)(endpoint, { method: 'POST', body })).rejects.toThrow(
        'NATIVE_BROKER_FETCH_OPERATION_UNVERIFIED',
      );
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });

  it('accepts a reused identical committed original operation without a second dispatch', async () => {
    const { factory, calls } = host({
      prepareOriginalOperation: async (args) => ({
        status: 'result_committed',
        checkpointId,
        operationKey,
        requestDigest: args.requestDigest,
      }),
    });
    await expect(factory(binding)(endpoint, { method: 'POST', body })).resolves.toBeInstanceOf(
      Response,
    );
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0].url).pathname).toBe('/execute');
    // The broker's CAS must serve this committed receipt, never send a second
    // provider request. This unit proves only the model-transport side.
  });

  it('does not install a transport without a trusted operation resolver', () => {
    expect(() =>
      createNativeMissionDetachedBrokerModelFetchFactory({
        getExecutionScope: () => scope,
        resolveModelBinding: () => ({ ...binding, endpoint }),
      }),
    ).toThrow('NATIVE_BROKER_HOST_BINDING_DEPENDENCIES');
  });
});
