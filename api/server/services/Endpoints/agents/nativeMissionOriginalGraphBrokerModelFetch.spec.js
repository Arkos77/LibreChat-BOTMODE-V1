'use strict';

const {
  createNativeMissionOriginalGraphBrokerModelFetch,
  createNativeMissionOriginalGraphBrokerModelFetchFactory,
} = require('./nativeMissionOriginalGraphBrokerModelFetch');
const { requestDigest } = require('./nativeMissionProviderBrokerHttp');

const secret = 'test-original-native-graph-broker-secret-32chars-minimum';
const modelEndpoint = 'https://openrouter.ai/api/v1/chat/completions';
const brokerUrl = 'http://ci-original-provider-broker:8096/';
const scope = {
  userId: 'owner', tenantId: 'tenant', streamId: 'parent',
  responseMessageId: 'response', generationCreatedAt: 1700000000000,
  checkpointNamespace: 'generation', nodeId: 'analysis-node',
  taskId: 'analysis-task', agentId: 'analysis',
};
const checkpoint = {
  threadId: 'parent', checkpointId: 'saved-graph-checkpoint',
  checkpointNamespace: 'generation', pendingNodes: ['analysis-node'],
};
const response = {
  id: 'original-result', model: 'ci-free',
  choices: [{ index: 0, finish_reason: 'stop',
    message: { role: 'assistant', content: 'verified original completion' } }],
};
const body = {
  model: 'ci-free', stream: true,
  messages: [{ role: 'user', content: 'analyse this checkpoint' }],
  stream_options: { include_usage: true },
};
const canonicalBody = { model: body.model, messages: body.messages, stream: false };
const receipt = { status: 'result_committed', resultAvailable: true, response };

function testHarness(recoveryOnly = false, overrides = {}) {
  const traffic = [];
  const fetchImpl = jest.fn(async (url, init) => {
    const path = new URL(url).pathname;
    traffic.push({ path, payload: JSON.parse(init.body), init });
    return new Response(JSON.stringify(receipt), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  });
  const getOriginalCheckpointReference = jest.fn(async () => checkpoint);
  const getScope = jest.fn(() => ({
    ...scope, ...(recoveryOnly ? { recoveryOnly: true } : {}),
  }));
  const recordOriginalModelRequest = jest.fn(async () => true);
  return {
    traffic, fetchImpl, getScope, getOriginalCheckpointReference,
    recordOriginalModelRequest,
    modelFetch: createNativeMissionOriginalGraphBrokerModelFetch({
      getScope, getOriginalCheckpointReference, recordOriginalModelRequest,
      provider: 'openrouter',
      model: 'ci-free', modelEndpoint, brokerUrl, secret,
      fetchImpl, pause: async () => {}, maxPolls: 2, ...overrides,
    }),
  };
}

describe('original direct LangGraph model transport (no detached child thread)', () => {
  it('dispatches the original model effect only through independent broker with immutable native checkpoint', async () => {
    const h = testHarness();
    const result = await h.modelFetch(modelEndpoint, {
      method: 'POST', body: JSON.stringify(body),
    });
    expect(result.status).toBe(200);
    expect(result.headers.get('content-type')).toBe('text/event-stream');
    const sse = await result.text();
    expect(sse).toContain('verified original completion');
    expect(sse).toContain('data: [DONE]');
    expect(h.traffic).toHaveLength(1);
    expect(h.recordOriginalModelRequest).toHaveBeenCalledTimes(1);
    expect(h.recordOriginalModelRequest).toHaveBeenCalledWith({
      identity: h.traffic[0].payload.identity,
      requestDigest: requestDigest(canonicalBody),
      checkpointProof: checkpoint,
    });
    expect(h.traffic[0].path).toBe('/execute-native-graph');
    expect(h.traffic[0].payload.requestDigest).toBe(requestDigest(canonicalBody));
    expect(h.traffic[0].payload.authorizedRequest).toEqual(canonicalBody);
    expect(h.traffic[0].payload.identity).toEqual({
      mode: 'native_graph', ...scope,
      graphCheckpointId: 'saved-graph-checkpoint',
      provider: 'openrouter', model: 'ci-free',
    });
    expect(h.traffic[0].payload.identity).not.toHaveProperty('operationKey');
    expect(h.getOriginalCheckpointReference).toHaveBeenCalledWith(scope);
  });

  it('cold recovery polls only original status and never reissues the provider call', async () => {
    const h = testHarness(true);
    const result = await h.modelFetch(modelEndpoint, {
      method: 'POST', body: JSON.stringify({ ...body, stream: false }),
    });
    expect(result.status).toBe(200);
    expect((await result.json()).choices[0].message.content).toBe(
      'verified original completion',
    );
    expect(h.traffic.map((e) => e.path)).toEqual(['/status-native-graph']);
    expect(h.recordOriginalModelRequest).not.toHaveBeenCalled();
    expect(h.traffic[0].payload.authorizedRequest).toBeUndefined();
  });

  it('never accepts a missing checkpoint, changed graph node or altered model request', async () => {
    for (const invalid of [
      { getOriginalCheckpointReference: async () => ({
        ...checkpoint, pendingNodes: ['research-node'],
      }) },
      { getOriginalCheckpointReference: async () => ({
        ...checkpoint, checkpointId: null,
      }) },
      { getOriginalCheckpointReference: async () => ({
        ...checkpoint, threadId: 'other-conversation',
      }) },
      { getOriginalCheckpointReference: async () => ({
        ...checkpoint, pendingNodes: ['analysis-node', 'unknown-node'],
      }) },
      { getScope: async () => ({
        ...scope, operationKey: 'a'.repeat(64),
      }) },
    ]) {
      const h = testHarness(true, invalid);
      await expect(h.modelFetch(modelEndpoint, {
        method: 'POST', body: JSON.stringify(body),
      })).rejects.toThrow(/NATIVE_GRAPH_FETCH_/);
      expect(h.fetchImpl).not.toHaveBeenCalled();
    }
    const h = testHarness();
    await expect(h.modelFetch(modelEndpoint, {
      method: 'POST', body: JSON.stringify({ ...body, model: 'paid-model' }),
    })).rejects.toThrow('NATIVE_GRAPH_FETCH_MODEL_EFFECT_UNSUPPORTED');
    await expect(h.modelFetch('https://evil.test/api/v1/chat/completions', {
      method: 'POST', body: JSON.stringify(body),
    })).rejects.toThrow('NATIVE_GRAPH_FETCH_REQUEST_UNSUPPORTED');
    expect(h.fetchImpl).not.toHaveBeenCalled();
  });

  it('does not convert unknown dispatch to a fake result or retry via /execute', async () => {
    const h = testHarness(true, {
      fetchImpl: jest.fn(async (url, init) => {
        h.traffic.push({ path: new URL(url).pathname, payload: JSON.parse(init.body) });
        return new Response(JSON.stringify({
          status: 'outcome_unknown', resultAvailable: false,
        }), { status: 200 });
      }),
    });
    await expect(h.modelFetch(modelEndpoint, {
      method: 'POST', body: JSON.stringify(body),
    })).rejects.toThrow('NATIVE_GRAPH_FETCH_ORIGINAL_RESULT_UNVERIFIED');
    expect(h.traffic.map((e) => e.path)).toEqual(['/status-native-graph']);
  });

  it('requires the original model binding in the host, not a caller-provided provider alias', async () => {
    const binding = {
      agentId: 'analysis', nodeId: 'analysis-node', taskId: 'analysis-task',
      provider: 'OpenRouter', model: 'ci-free',
    };
    const resolveModelBinding = jest.fn(() => ({
      agentId: binding.agentId, provider: 'openrouter',
      model: binding.model, endpoint: modelEndpoint,
    }));
    const factory = createNativeMissionOriginalGraphBrokerModelFetchFactory({
      getScope: () => scope,
      getOriginalCheckpointReference: async () => checkpoint,
      recordOriginalModelRequest: async () => true,
      resolveModelBinding, brokerUrl, secret,
      fetchImpl: jest.fn(async () => new Response(JSON.stringify(receipt), { status: 200 })),
    });
    expect(typeof factory(binding)).toBe('function');
    expect(resolveModelBinding).toHaveBeenCalledWith({
      ...binding, provider: 'openrouter',
    });
    expect(() => factory({ ...binding, model: 'other-model' }))
      .toThrow('NATIVE_GRAPH_FETCH_FACTORY_MODEL_UNAUTHORIZED');
    expect(() => factory({ ...binding, provider: 'unknown-provider' }))
      .toThrow('NATIVE_GRAPH_FETCH_FACTORY_MODEL_UNAUTHORIZED');
  });
});
