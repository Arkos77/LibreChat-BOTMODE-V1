'use strict';

const http = require('node:http');
const { createHash, createHmac, timingSafeEqual } = require('node:crypto');

const MAX_BODY_BYTES = 256 * 1024;
const CLOCK_SKEW_MS = 60_000;

function requestDigest(payload) {
  const canonical = (value) => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value == null || typeof value !== 'object') return value;
    if (Object.prototype.toString.call(value) !== '[object Object]') {
      throw new Error('NATIVE_BROKER_REQUEST_SHAPE_INVALID');
    }
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  };
  return createHash('sha256')
    .update(JSON.stringify(canonical(payload)))
    .digest('hex');
}

function authenticate({ secret, timestamp, signature, body, now }) {
  if (
    typeof timestamp !== 'string' ||
    !/^\d{13}$/.test(timestamp) ||
    Math.abs(now() - Number(timestamp)) > CLOCK_SKEW_MS ||
    typeof signature !== 'string' ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    return false;
  const expected = createHmac('sha256', secret)
    .update(timestamp + '.' + body)
    .digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

function createNativeMissionProviderBrokerHttpServer({
  store,
  broker,
  secret,
  provider,
  authorizeScope,
  now = Date.now,
}) {
  if (
    !store ||
    typeof store.read !== 'function' ||
    !broker ||
    typeof broker.execute !== 'function' ||
    typeof secret !== 'string' ||
    Buffer.byteLength(secret) < 32 ||
    typeof provider !== 'string' ||
    !provider ||
    typeof authorizeScope !== 'function' ||
    typeof now !== 'function'
  ) {
    throw new Error('NATIVE_BROKER_HTTP_DEPENDENCIES_MISSING');
  }
  return http.createServer(async (req, res) => {
    const respond = (status, value) => {
      if (res.destroyed) return;
      res.writeHead(status, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      });
      res.end(JSON.stringify(value));
    };
    if (req.method !== 'POST' || (req.url !== '/execute' && req.url !== '/status')) {
      return respond(404, { error: 'not_found' });
    }
    try {
      const buffers = [];
      let length = 0;
      for await (const piece of req) {
        length += piece.length;
        if (length > MAX_BODY_BYTES) throw new Error('REQUEST_TOO_LARGE');
        buffers.push(piece);
      }
      const raw = Buffer.concat(buffers).toString('utf8');
      if (
        !authenticate({
          secret,
          timestamp: req.headers['x-botmode-broker-ts'],
          signature: req.headers['x-botmode-broker-hmac'],
          body: raw,
          now,
        })
      ) {
        return respond(401, { error: 'unauthorized' });
      }
      const payload = JSON.parse(raw);
      const identity = payload?.identity;
      const digest = payload?.requestDigest;
      if (identity?.provider !== provider || typeof digest !== 'string') {
        return respond(403, { error: 'forbidden' });
      }
      if ((await authorizeScope({ identity, requestDigest: digest })) !== true) {
        return respond(403, { error: 'forbidden' });
      }
      if (req.url === '/status') {
        const result = await store.read({ identity, requestDigest: digest });
        return respond(200, result);
      }
      const authorizedRequest = payload.authorizedRequest;
      if (
        !authorizedRequest ||
        authorizedRequest.model !== identity.model ||
        authorizedRequest.stream !== false ||
        !Array.isArray(authorizedRequest.messages) ||
        requestDigest(authorizedRequest) !== digest
      ) {
        return respond(403, { error: 'request_mismatch' });
      }
      const result = await broker.execute({ identity, requestDigest: digest, authorizedRequest });
      return respond(200, result);
    } catch {
      // Never log payloads, provider credentials, responses, or stack traces.
      return respond(503, { error: 'unavailable' });
    }
  });
}

/** Fixture-only upstream: a caller can never select a URL to fetch. */
function createFixedLocalProviderSender({ url, fetchImpl = fetch, allowCiDockerHost = false }) {
  const destination = new URL(url);
  if (
    destination.protocol !== 'http:' ||
    !(
      ['localhost', '127.0.0.1'].includes(destination.hostname) ||
      (allowCiDockerHost === true && destination.hostname === 'host.docker.internal')
    ) ||
    destination.pathname !== '/v1/chat/completions' ||
    destination.username ||
    destination.password ||
    destination.search ||
    destination.hash ||
    typeof fetchImpl !== 'function'
  ) {
    throw new Error('NATIVE_BROKER_FIXTURE_ENDPOINT_DENIED');
  }
  return async (body) => {
    const response = await fetchImpl(destination, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok || response.status !== 200) {
      throw new Error('NATIVE_BROKER_FIXTURE_REQUEST_FAILED');
    }
    const json = await response.json();
    if (!json || typeof json !== 'object') {
      throw new Error('NATIVE_BROKER_FIXTURE_RESULT_INVALID');
    }
    return json;
  };
}

module.exports = {
  requestDigest,
  createNativeMissionProviderBrokerHttpServer,
  createFixedLocalProviderSender,
};
