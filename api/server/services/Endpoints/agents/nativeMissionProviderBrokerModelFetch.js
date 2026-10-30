'use strict';

const { createHmac } = require('node:crypto');
const { requestDigest } = require('./nativeMissionProviderBrokerHttp');

const HEX = /^[a-f0-9]{64}$/;
const IDS = [
  'userId',
  'parentConversationId',
  'parentRunId',
  'parentToolCallId',
  'childThreadId',
  'taskId',
  'attemptKey',
  'agentId',
];
const ACTIVE = new Set(['prepared', 'claimed', 'dispatched']);
const MAX_BODY = 256 * 1024;

function denied(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function validScope(scope) {
  return (
    scope != null &&
    IDS.every(
      (key) =>
        typeof scope[key] === 'string' && scope[key].length > 0 && scope[key].length <= 256,
    ) &&
    (scope.tenantId == null ||
      (typeof scope.tenantId === 'string' && scope.tenantId.length <= 256))
  );
}

function exactScope(original, scope) {
  return (
    validScope(original) &&
    IDS.every((key) => original[key] === scope[key]) &&
    (original.tenantId ?? '') === (scope.tenantId ?? '')
  );
}

/**
 * CI-only OpenAI-compatible fetch seam for the original detached child model
 * request. This is NOT automatically installed in the SDK: an approved run
 * must supply a durable operation resolver and independently authorize the
 * original model binding before activating it.
 *
 * The adapter never falls back to provider HTTP, never retries /execute, and
 * never invents a call identity from prompt hashes or request order.
 */
function createNativeMissionBrokerModelFetch({
  getScope,
  resolveOriginalOperation,
  originalProvider,
  originalModel,
  originalModelEndpoint,
  brokerUrl,
  secret,
  fetchImpl = fetch,
  now = Date.now,
  pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  maxPolls = 12,
}) {
  if (
    typeof getScope !== 'function' ||
    typeof resolveOriginalOperation !== 'function' ||
    typeof originalProvider !== 'string' ||
    originalProvider.length === 0 ||
    typeof originalModel !== 'string' ||
    originalModel.length === 0 ||
    typeof originalModelEndpoint !== 'string' ||
    typeof brokerUrl !== 'string' ||
    typeof secret !== 'string' ||
    Buffer.byteLength(secret) < 32 ||
    typeof fetchImpl !== 'function' ||
    typeof now !== 'function' ||
    typeof pause !== 'function' ||
    !Number.isSafeInteger(maxPolls) ||
    maxPolls < 1 ||
    maxPolls > 60
  ) {
    denied('NATIVE_BROKER_FETCH_DEPENDENCIES_INVALID');
  }
  const modelEndpoint = new URL(originalModelEndpoint);
  const broker = new URL(brokerUrl);
  if (
    modelEndpoint.pathname !== '/v1/chat/completions' ||
    modelEndpoint.search ||
    modelEndpoint.hash ||
    !['http:', 'https:'].includes(modelEndpoint.protocol) ||
    broker.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', 'ci-provider-broker'].includes(broker.hostname) ||
    (broker.pathname !== '/' && broker.pathname !== '') ||
    broker.search ||
    broker.hash ||
    broker.username ||
    broker.password
  ) {
    denied('NATIVE_BROKER_FETCH_ENDPOINT_DENIED');
  }

  const brokerPost = async (path, payload, signal) => {
    const raw = JSON.stringify(payload);
    const timestamp = String(now());
    const signature = createHmac('sha256', secret)
      .update(timestamp + '.' + raw)
      .digest('hex');
    const response = await fetchImpl(new URL(path, broker), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-botmode-broker-ts': timestamp,
        'x-botmode-broker-hmac': signature,
      },
      body: raw,
      signal,
      redirect: 'error',
    });
    if (response.status !== 200) denied('NATIVE_BROKER_FETCH_UNAVAILABLE');
    const parsed = await response.json();
    if (!parsed || typeof parsed !== 'object' || !Object.hasOwn(parsed, 'status')) {
      denied('NATIVE_BROKER_FETCH_RECEIPT_INVALID');
    }
    return parsed;
  };

  return async (url, init = {}) => {
    const scope = getScope();
    if (!validScope(scope)) denied('NATIVE_BROKER_FETCH_NO_ORIGINAL_CHILD');
    const endpoint = new URL(url instanceof Request ? url.url : String(url));
    if (endpoint.href !== modelEndpoint.href || init?.method?.toUpperCase() !== 'POST') {
      denied('NATIVE_BROKER_FETCH_MODEL_ENDPOINT_MISMATCH');
    }
    // Fail closed for streaming/tool-enabled model operations until an SDK
    // continuation with durable token/event receipts has been qualified.
    if (typeof init.body !== 'string' || Buffer.byteLength(init.body) > MAX_BODY) {
      denied('NATIVE_BROKER_FETCH_BODY_INVALID');
    }
    let body;
    try {
      body = JSON.parse(init.body);
    } catch {
      denied('NATIVE_BROKER_FETCH_BODY_INVALID');
    }
    if (
      body == null ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      body.model !== originalModel ||
      body.stream !== false ||
      !Array.isArray(body.messages) ||
      body.tools != null ||
      body.tool_choice != null
    ) {
      denied('NATIVE_BROKER_FETCH_UNSUPPORTED_MODEL_EFFECT');
    }
    const digest = requestDigest(body);
    const permit = await resolveOriginalOperation({
      scope: Object.freeze({ ...scope }),
      provider: originalProvider,
      model: originalModel,
      requestDigest: digest,
    });
    if (
      permit?.approved !== true ||
      !exactScope(permit.scope, scope) ||
      permit.provider !== originalProvider ||
      permit.model !== originalModel ||
      permit.requestDigest !== digest ||
      typeof permit.operationKey !== 'string' ||
      !HEX.test(permit.operationKey)
    ) {
      denied('NATIVE_BROKER_FETCH_OPERATION_UNVERIFIED');
    }
    const identity = {
      userId: scope.userId,
      tenantId: scope.tenantId ?? '',
      parentConversationId: scope.parentConversationId,
      parentRunId: scope.parentRunId,
      childThreadId: scope.childThreadId,
      taskId: scope.taskId,
      attemptKey: scope.attemptKey,
      agentId: scope.agentId,
      provider: originalProvider,
      model: originalModel,
      operationKey: permit.operationKey,
    };
    const payload = { identity, requestDigest: digest };
    // No authorization headers, API keys or client-provided URLs are passed
    // to the broker. Only a canonical approved model request is transmitted.
    let receipt = await brokerPost(
      '/execute',
      { ...payload, authorizedRequest: body },
      init.signal,
    );
    for (let i = 0; i < maxPolls && ACTIVE.has(receipt.status); i++) {
      await pause(200);
      receipt = await brokerPost('/status', payload, init.signal);
    }
    if (
      receipt.status !== 'result_committed' ||
      receipt.resultAvailable !== true ||
      receipt.response == null ||
      typeof receipt.response !== 'object' ||
      !Array.isArray(receipt.response.choices)
    ) {
      denied('NATIVE_BROKER_FETCH_RESULT_NOT_PROVEN');
    }
    return new Response(JSON.stringify(receipt.response), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  };
}

module.exports = { createNativeMissionBrokerModelFetch };
