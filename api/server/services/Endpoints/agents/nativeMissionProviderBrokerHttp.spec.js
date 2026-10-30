'use strict';

const { createHmac, createHash } = require('node:crypto');
const {
  requestDigest,
  createNativeMissionProviderBrokerHttpServer,
  createFixedLocalProviderSender,
} = require('./nativeMissionProviderBrokerHttp');

const secret = 'ci-local-only-secret-with-32-plus-characters';
const identity = {
  userId: 'ci-user',
  tenantId: 'ci-tenant',
  parentConversationId: 'ci-parent',
  parentRunId: 'ci-response',
  childThreadId: 'ci-child',
  taskId: 'ci-task',
  attemptKey: 'ci-attempt',
  agentId: 'ci-agent',
  provider: 'ci-local-fixture',
  model: 'ci-free',
  operationKey: createHash('sha256').update('ci-operation').digest('hex'),
};
const authorizedRequest = {
  model: 'ci-free',
  stream: false,
  messages: [{ role: 'user', content: 'ok' }],
};
const scope = { identity, requestDigest: requestDigest(authorizedRequest) };

let server;
let port;
let store;
let broker;
let authorizeScope;

beforeEach(async () => {
  store = {
    read: jest.fn().mockResolvedValue({ status: 'result_committed', response: { ok: true } }),
  };
  broker = {
    execute: jest.fn().mockResolvedValue({ status: 'result_committed', response: { ok: true } }),
  };
  authorizeScope = jest.fn().mockResolvedValue(true);
  server = createNativeMissionProviderBrokerHttpServer({
    store,
    broker,
    secret,
    provider: 'ci-local-fixture',
    authorizeScope,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

function signed(path, payload, valid = true) {
  const raw = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const signature = createHmac('sha256', valid ? secret : 'wrong-secret')
    .update(timestamp + '.' + raw)
    .digest('hex');
  return fetch('http://127.0.0.1:' + port + path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-botmode-broker-ts': timestamp,
      'x-botmode-broker-hmac': signature,
    },
    body: raw,
  });
}

describe('private fixture-only provider broker ingress', () => {
  it('accepts only a signed scoped call and permits authenticated result retrieval', async () => {
    const executed = await signed('/execute', { ...scope, authorizedRequest });
    expect(executed.status).toBe(200);
    expect(broker.execute).toHaveBeenCalledWith({ ...scope, authorizedRequest });
    const read = await signed('/status', scope);
    expect(read.status).toBe(200);
    expect(store.read).toHaveBeenCalledWith(scope);
  });

  it('rejects invalid signatures before any provider call', async () => {
    const response = await signed('/execute', { ...scope, authorizedRequest }, false);
    expect(response.status).toBe(401);
    expect(broker.execute).not.toHaveBeenCalled();
  });

  it('refuses changed model or payload against the exact request digest', async () => {
    const changed = { ...authorizedRequest, model: 'other-model' };
    expect((await signed('/execute', { ...scope, authorizedRequest: changed })).status).toBe(403);
    const changedContent = {
      ...authorizedRequest,
      messages: [{ role: 'user', content: 'different' }],
    };
    expect((await signed('/execute', { ...scope, authorizedRequest: changedContent })).status).toBe(
      403,
    );
    expect(broker.execute).not.toHaveBeenCalled();
  });

  it('refuses unapproved tenant scope and provider identity', async () => {
    authorizeScope.mockResolvedValue(false);
    expect((await signed('/status', scope)).status).toBe(403);
    authorizeScope.mockResolvedValue(true);
    const foreign = { ...scope, identity: { ...identity, provider: 'foreign' } };
    expect((await signed('/execute', { ...foreign, authorizedRequest })).status).toBe(403);
    expect(broker.execute).not.toHaveBeenCalled();
    expect(store.read).not.toHaveBeenCalled();
  });

  it('restricts fixture upstreams to a fixed loopback address', async () => {
    expect(() =>
      createFixedLocalProviderSender({ url: 'http://169.254.169.254/v1/chat/completions' }),
    ).toThrow('NATIVE_BROKER_FIXTURE_ENDPOINT_DENIED');
    expect(() =>
      createFixedLocalProviderSender({ url: 'https://openrouter.ai/v1/chat/completions' }),
    ).toThrow('NATIVE_BROKER_FIXTURE_ENDPOINT_DENIED');
    expect(() =>
      createFixedLocalProviderSender({
        url: 'http://host.docker.internal/v1/chat/completions',
      }),
    ).toThrow('NATIVE_BROKER_FIXTURE_ENDPOINT_DENIED');
  });

  it('continues an accepted call when the API client disconnects', async () => {
    let signalStarted;
    let releaseResult;
    const started = new Promise((resolve) => {
      signalStarted = resolve;
    });
    const release = new Promise((resolve) => {
      releaseResult = resolve;
    });
    broker.execute.mockImplementation(async () => {
      signalStarted();
      await release;
      store.read.mockResolvedValue({ status: 'result_committed', response: { final: true } });
      return { status: 'result_committed' };
    });
    const controller = new AbortController();
    const raw = JSON.stringify({ ...scope, authorizedRequest });
    const timestamp = String(Date.now());
    const signature = createHmac('sha256', secret)
      .update(timestamp + '.' + raw)
      .digest('hex');
    const request = fetch('http://127.0.0.1:' + port + '/execute', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'x-botmode-broker-ts': timestamp, 'x-botmode-broker-hmac': signature },
      body: raw,
    }).catch(() => undefined);
    await started;
    controller.abort();
    releaseResult();
    await request;
    const response = await signed('/status', scope);
    expect((await response.json()).response).toEqual({ final: true });
    expect(broker.execute).toHaveBeenCalledTimes(1);
  });
});
