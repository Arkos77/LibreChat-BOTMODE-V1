#!/usr/bin/env node
'use strict';

// Docker CI only. This script uses a private synthetic request and the
// independently running broker container; it never contacts a paid provider.
const { createHash, createHmac } = require('node:crypto');
const { requestDigest } = require('../../api/server/services/Endpoints/agents/nativeMissionProviderBrokerHttp');

if (
  process.env.BOTMODE_CI_BROKER !== '1' ||
  !process.env.COMPOSE_PROJECT_NAME?.startsWith('botmode-pr107-head-')
) {
  throw new Error('CI_BROKER_SMOKE_ISOLATION_REQUIRED');
}

const identity = {
  userId: process.env.BOTMODE_CI_BROKER_USER_ID,
  tenantId: process.env.BOTMODE_CI_BROKER_TENANT_ID,
  parentConversationId: 'ci-broker-parent',
  parentRunId: 'ci-broker-original-run',
  childThreadId: 'ci-broker-child',
  taskId: 'ci-broker-task',
  attemptKey: 'ci-broker-original-attempt',
  agentId: process.env.BOTMODE_CI_BROKER_AGENT_ID,
  provider: 'ci-local-fixture',
  model: 'ci-free',
  operationKey: createHash('sha256').update('ci-pr107-broker-original-operation').digest('hex'),
};
const authorizedRequest = {
  model: 'ci-free',
  stream: false,
  messages: [{ role: 'user', content: 'ci-broker-mongo-smoke' }],
};
const scope = { identity, requestDigest: requestDigest(authorizedRequest) };
const secret = process.env.BOTMODE_CI_BROKER_SECRET;
if (typeof secret !== 'string' || secret.length < 32) {
  throw new Error('CI_BROKER_SMOKE_SECRET_MISSING');
}

async function signed(path, payload) {
  const body = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const signature = createHmac('sha256', secret)
    .update(timestamp + '.' + body)
    .digest('hex');
  const response = await fetch('http://127.0.0.1:8095' + path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-botmode-broker-ts': timestamp,
      'x-botmode-broker-hmac': signature,
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('CI_BROKER_SMOKE_HTTP_' + response.status);
  return response.json();
}

async function verify() {
  const data = await signed('/status', scope);
  if (data.status !== 'result_committed' || !data.response) {
    throw new Error('CI_BROKER_RESULT_NOT_DURABLE');
  }
  console.log('CI_PR107_BROKER_MONGO_RESULT=PASS');
}
async function main() {
  const mode = process.argv[2];
  if (mode === 'verify') return verify();
  if (mode !== 'execute') throw new Error('CI_BROKER_MODE_INVALID');
  const [first, second] = await Promise.all([
    signed('/execute', { ...scope, authorizedRequest }),
    signed('/execute', { ...scope, authorizedRequest }),
  ]);
  if (![first.status, second.status].every((status) =>
    ['dispatched', 'result_committed', 'claimed'].includes(status)
  )) {
    throw new Error('CI_BROKER_CONCURRENT_CLAIM_INVALID');
  }
  await verify();
  console.log('CI_PR107_BROKER_TWO_CONCURRENT_REQUESTS=PASS');
}
main().catch((error) => {
  // Error codes only: never print the provider response or credentials.
  const code = String(error.message).replace(/[^A-Z0-9_]/g, '').slice(0, 64);
  console.error('CI_PR107_BROKER_SMOKE_FAIL=' + code);
  process.exitCode = 1;
});
