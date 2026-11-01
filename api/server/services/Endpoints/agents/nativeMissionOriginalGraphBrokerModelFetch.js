'use strict';

const { createHmac } = require('node:crypto');
const { requestDigest } = require('./nativeMissionProviderBrokerHttp');

const HEX = /^[a-f0-9]{64}$/;
const ACTIVE = new Set(['prepared', 'claimed', 'dispatched']);
const MAX_BODY = 256 * 1024;
const COORDINATES = [
  'userId', 'tenantId', 'streamId', 'responseMessageId',
  'checkpointNamespace', 'nodeId', 'taskId', 'agentId',
];

function deny(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function validScope(scope) {
  return scope != null &&
    COORDINATES.every((field) =>
      typeof scope[field] === 'string' &&
      scope[field].length <= 256 &&
      (field === 'tenantId' || scope[field].length > 0)) &&
    Number.isSafeInteger(scope.generationCreatedAt) &&
    scope.generationCreatedAt > 0 &&
    (scope.recoveryOnly === undefined || scope.recoveryOnly === true);
}

/**
 * Native LangGraph node fetch adapter. This differs from detached subagent
 * transport: no child thread, no child-task lease and no caller-selected
 * operationKey. A trusted host pins the immutable root mission and reads
 * the actual durable root checkpoint. The independent broker independently
 * rechecks the same original mission, model and graph step before dispatch.
 *
 * Cold recovery is READ ONLY, including when a reservation is still pending.
 * An unresolved receipt is an error; NEVER issue a second provider request.
 * This module is inert until a validated host supplies it to createRun.
 */
function createNativeMissionOriginalGraphBrokerModelFetch({
  getScope,
  getOriginalCheckpointReference,
  recordOriginalModelRequest,
  provider,
  model,
  modelEndpoint,
  brokerUrl,
  secret,
  fetchImpl = fetch,
  now = Date.now,
  pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  maxPolls = 30,
}) {
  if (
    typeof getScope !== 'function' ||
    typeof getOriginalCheckpointReference !== 'function' ||
    typeof recordOriginalModelRequest !== 'function' ||
    !['openai', 'openrouter'].includes(provider) ||
    typeof model !== 'string' || !model || model.length > 256 ||
    typeof modelEndpoint !== 'string' ||
    typeof brokerUrl !== 'string' ||
    typeof secret !== 'string' || Buffer.byteLength(secret) < 32 ||
    typeof fetchImpl !== 'function' ||
    typeof now !== 'function' || typeof pause !== 'function' ||
    !Number.isSafeInteger(maxPolls) || maxPolls < 1 || maxPolls > 60
  ) {
    deny('NATIVE_GRAPH_FETCH_HOST_DEPENDENCIES_MISSING');
  }
  const endpoint = new URL(modelEndpoint);
  const broker = new URL(brokerUrl);
  const expectedPath = provider === 'openrouter'
    ? '/api/v1/chat/completions' : '/v1/chat/completions';
  if (
    !['http:', 'https:'].includes(endpoint.protocol) ||
    endpoint.pathname !== expectedPath ||
    endpoint.search || endpoint.hash || endpoint.username || endpoint.password ||
    !endpoint.hostname ||
    broker.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', 'ci-provider-broker', 'ci-original-provider-broker']
      .includes(broker.hostname) ||
    !['', '/'].includes(broker.pathname) ||
    broker.search || broker.hash || broker.username || broker.password
  ) {
    deny('NATIVE_GRAPH_FETCH_ENDPOINT_UNAUTHORIZED');
  }

  const post = async (path, payload, signal) => {
    const raw = JSON.stringify(payload);
    const timestamp = String(now());
    const hmac = createHmac('sha256', secret)
      .update(timestamp + '.' + raw).digest('hex');
    const response = await fetchImpl(new URL(path, broker), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-botmode-broker-ts': timestamp,
        'x-botmode-broker-hmac': hmac,
      },
      body: raw,
      signal,
      redirect: 'error',
    });
    if (response?.status !== 200) deny('NATIVE_GRAPH_FETCH_BROKER_UNAVAILABLE');
    const receipt = await response.json();
    if (!receipt || typeof receipt !== 'object' || typeof receipt.status !== 'string') {
      deny('NATIVE_GRAPH_FETCH_RECEIPT_INVALID');
    }
    return receipt;
  };

  return async (url, init = {}) => {
    const scope = await getScope();
    if (!validScope(scope) || scope.provider != null || scope.model != null ||
      scope.operationKey != null || scope.graphCheckpointId != null) {
      deny('NATIVE_GRAPH_FETCH_SCOPE_INVALID');
    }
    const requestedEndpoint = new URL(url instanceof Request ? url.url : String(url));
    if (requestedEndpoint.href !== endpoint.href ||
      init.method?.toUpperCase() !== 'POST' ||
      typeof init.body !== 'string' ||
      Buffer.byteLength(init.body, 'utf8') > MAX_BODY) {
      deny('NATIVE_GRAPH_FETCH_REQUEST_UNSUPPORTED');
    }
    let body;
    try {
      body = JSON.parse(init.body);
    } catch {
      deny('NATIVE_GRAPH_FETCH_REQUEST_INVALID');
    }
    if (
      !body || typeof body !== 'object' || Array.isArray(body) ||
      body.model !== model ||
      ![true, false].includes(body.stream) ||
      !Array.isArray(body.messages) ||
      body.tools != null || body.tool_choice != null ||
      (body.n != null && body.n !== 1)
    ) {
      deny('NATIVE_GRAPH_FETCH_MODEL_EFFECT_UNSUPPORTED');
    }
    const requestedStream = body.stream === true;
    const authorizedRequest = requestedStream
      ? Object.fromEntries(Object.entries({ ...body, stream: false })
          .filter(([key]) => key !== 'stream_options'))
      : body;
    const digest = requestDigest(authorizedRequest);
    if (!HEX.test(digest)) deny('NATIVE_GRAPH_FETCH_DIGEST_INVALID');
    const checkpoint = await getOriginalCheckpointReference(Object.freeze({ ...scope }));
    if (
      checkpoint?.threadId !== scope.streamId ||
      checkpoint?.checkpointNamespace !== scope.checkpointNamespace ||
      typeof checkpoint?.checkpointId !== 'string' ||
      !checkpoint.checkpointId || checkpoint.checkpointId.length > 256 ||
      !Array.isArray(checkpoint.pendingNodes) ||
      checkpoint.pendingNodes.length !== 1 ||
      checkpoint.pendingNodes[0] !== scope.nodeId
    ) {
      deny('NATIVE_GRAPH_FETCH_ORIGINAL_CHECKPOINT_UNVERIFIED');
    }
    const identity = {
      mode: 'native_graph',
      userId: scope.userId,
      tenantId: scope.tenantId,
      streamId: scope.streamId,
      responseMessageId: scope.responseMessageId,
      generationCreatedAt: scope.generationCreatedAt,
      checkpointNamespace: scope.checkpointNamespace,
      graphCheckpointId: checkpoint.checkpointId,
      nodeId: scope.nodeId,
      taskId: scope.taskId,
      agentId: scope.agentId,
      provider,
      model,
    };
    const query = { identity, requestDigest: digest };
    const statusPath = '/status-native-graph';
    // Never send a provider effect when replaying a crashed API run.
    // Only the original running graph may record a one-shot model intent.
    // Cold recovery never creates an intent and never dispatches a provider.
    if (scope.recoveryOnly !== true &&
      (await recordOriginalModelRequest(query)) !== true) {
      deny('NATIVE_GRAPH_FETCH_ORIGINAL_INTENT_NOT_DURABLE');
    }
    let receipt = scope.recoveryOnly === true
      ? await post(statusPath, query, init.signal)
      : await post('/execute-native-graph',
          { ...query, authorizedRequest }, init.signal);
    for (let i = 0; i < maxPolls && ACTIVE.has(receipt.status); i++) {
      await pause(200);
      receipt = await post(statusPath, query, init.signal);
    }
    if (
      receipt.status !== 'result_committed' ||
      receipt.resultAvailable !== true ||
      !Array.isArray(receipt.response?.choices)
    ) deny('NATIVE_GRAPH_FETCH_ORIGINAL_RESULT_UNVERIFIED');
    const completion = receipt.response;
    if (!requestedStream) {
      return new Response(JSON.stringify(completion), {
        status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    }
    const choice = completion.choices[0];
    if (
      completion.choices.length !== 1 ||
      choice?.index !== 0 ||
      choice.finish_reason !== 'stop' ||
      choice.message?.role !== 'assistant' ||
      typeof choice.message.content !== 'string' ||
      choice.message.tool_calls != null ||
      choice.message.function_call != null
    ) deny('NATIVE_GRAPH_FETCH_STREAM_RESULT_UNSUPPORTED');
    const meta = {
      id: typeof completion.id === 'string' ? completion.id : 'durable-native-graph-receipt',
      object: 'chat.completion.chunk',
      created: Number.isSafeInteger(completion.created) ? completion.created : 0,
      model,
    };
    const event = (choices, extra = {}) =>
      'data: ' + JSON.stringify({ ...meta, choices, ...extra }) + '\n\n';
    const first = event([{
      index: 0, delta: { role: 'assistant', content: choice.message.content },
      finish_reason: null,
    }]);
    const last = event([{ index: 0, delta: {}, finish_reason: 'stop' }]);
    const usage = body.stream_options?.include_usage === true && completion.usage != null
      ? event([], { usage: completion.usage }) : '';
    return new Response(first + last + usage + 'data: [DONE]\n\n', {
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' },
    });
  };
}

/** Bind a fixed saved provider/model catalog and original-node scope, not
 * model-supplied arguments. This factory is opt-in and has no default host.
 */
function createNativeMissionOriginalGraphBrokerModelFetchFactory({
  getScope,
  getOriginalCheckpointReference,
  recordOriginalModelRequest,
  resolveModelBinding,
  brokerUrl,
  secret,
  fetchImpl,
  now,
  pause,
  maxPolls,
}) {
  if (
    typeof getScope !== 'function' ||
    typeof getOriginalCheckpointReference !== 'function' ||
    typeof recordOriginalModelRequest !== 'function' ||
    typeof resolveModelBinding !== 'function'
  ) deny('NATIVE_GRAPH_FETCH_FACTORY_DEPENDENCIES_MISSING');
  return (binding) => {
    if (
      !binding || typeof binding.agentId !== 'string' ||
      typeof binding.nodeId !== 'string' ||
      typeof binding.taskId !== 'string' ||
      typeof binding.provider !== 'string' ||
      typeof binding.model !== 'string'
    ) deny('NATIVE_GRAPH_FETCH_FACTORY_MODEL_UNAUTHORIZED');
    const provider = binding.provider === 'OpenRouter'
      ? 'openrouter' : binding.provider;
    const persisted = resolveModelBinding({
      ...binding, provider,
    });
    if (
      !persisted ||
      persisted.agentId !== binding.agentId ||
      persisted.provider !== provider ||
      persisted.model !== binding.model ||
      typeof persisted.endpoint !== 'string'
    ) deny('NATIVE_GRAPH_FETCH_FACTORY_MODEL_UNAUTHORIZED');
    return createNativeMissionOriginalGraphBrokerModelFetch({
      getScope: () => {
        const scope = getScope(binding);
        if (
          scope?.agentId !== binding.agentId ||
          scope?.nodeId !== binding.nodeId ||
          scope?.taskId !== binding.taskId
        ) deny('NATIVE_GRAPH_FETCH_FACTORY_ORIGINAL_NODE_CHANGED');
        return scope;
      },
      getOriginalCheckpointReference,
      recordOriginalModelRequest,
      provider,
      model: binding.model,
      modelEndpoint: persisted.endpoint,
      brokerUrl,
      secret,
      ...(fetchImpl && { fetchImpl }),
      ...(now && { now }),
      ...(pause && { pause }),
      ...(maxPolls && { maxPolls }),
    });
  };
}

module.exports = {
  createNativeMissionOriginalGraphBrokerModelFetch,
  createNativeMissionOriginalGraphBrokerModelFetchFactory,
};
