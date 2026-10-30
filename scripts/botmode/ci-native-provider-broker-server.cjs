#!/usr/bin/env node
'use strict';

/** Explicitly CI-only provider broker. Never starts with LibreChat's API. */
const { MongoClient } = require('mongodb');
const {
  createNativeMissionProviderCallReceiptStore,
} = require('../../api/server/services/Endpoints/agents/nativeMissionProviderCallReceiptStore');
const {
  createNativeMissionProviderCallBroker,
} = require('../../api/server/services/Endpoints/agents/nativeMissionProviderCallBroker');
const {
  createNativeMissionProviderBrokerHttpServer,
  createFixedLocalProviderSender,
} = require('../../api/server/services/Endpoints/agents/nativeMissionProviderBrokerHttp');

const isolated =
  process.env.BOTMODE_CI_BROKER === '1' &&
  process.env.COMPOSE_PROJECT_NAME?.startsWith('botmode-pr107-head-') === true;
if (!isolated) {
  throw new Error('NATIVE_BROKER_CI_ONLY');
}

const secret = process.env.BOTMODE_CI_BROKER_SECRET;
const mongoUri = process.env.BOTMODE_CI_BROKER_MONGO_URI;
const upstream = process.env.BOTMODE_CI_BROKER_FIXTURE_URL;
const userId = process.env.BOTMODE_CI_BROKER_USER_ID;
const tenantId = process.env.BOTMODE_CI_BROKER_TENANT_ID;
const allowedAgentId = process.env.BOTMODE_CI_BROKER_AGENT_ID;
if (
  typeof secret !== 'string' ||
  secret.length < 32 ||
  !mongoUri ||
  !upstream ||
  !userId ||
  !tenantId ||
  !allowedAgentId
) {
  throw new Error('NATIVE_BROKER_CI_CONFIG_INCOMPLETE');
}
const mongo = new URL(mongoUri);
if (
  mongo.protocol !== 'mongodb:' ||
  !['127.0.0.1', 'localhost'].includes(mongo.hostname) ||
  !mongo.port ||
  mongo.password.length === 0
) {
  throw new Error('NATIVE_BROKER_CI_DATABASE_NOT_LOOPBACK');
}

const allowed = ({ identity, requestDigest }) =>
  identity?.userId === userId &&
  identity.tenantId === tenantId &&
  identity.agentId === allowedAgentId &&
  identity.provider === 'ci-local-fixture' &&
  identity.model === 'ci-free' &&
  typeof requestDigest === 'string' &&
  /^[a-f0-9]{64}$/.test(requestDigest);

(async () => {
  const client = new MongoClient(mongoUri, { maxPoolSize: 4, serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const collection = client.db().collection('native_mission_provider_calls_ci');
  const store = createNativeMissionProviderCallReceiptStore({ collection });
  const sender = createFixedLocalProviderSender({ url: upstream });
  const broker = createNativeMissionProviderCallBroker({
    store,
    assertAuthorized: async ({ identity, requestDigest, authorizedRequest }) => {
      if (
        !allowed({ identity, requestDigest }) ||
        authorizedRequest?.model !== 'ci-free' ||
        authorizedRequest?.stream !== false ||
        !Array.isArray(authorizedRequest.messages) ||
        authorizedRequest.messages.length > 32 ||
        authorizedRequest.tools != null
      ) {
        throw new Error('NATIVE_BROKER_CI_CALL_DENIED');
      }
    },
    sendProvider: sender,
  });
  const server = createNativeMissionProviderBrokerHttpServer({
    store,
    broker,
    secret,
    provider: 'ci-local-fixture',
    authorizeScope: async (scope) => allowed(scope),
  });
  const shutdown = () => {
    server.closeAllConnections();
    server.close(() => void client.close());
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  // Never expose a listening port outside the ephemeral runner's loopback.
  server.listen(8095, '127.0.0.1', () => {
    process.stdout.write('CI_NATIVE_BROKER_READY=PASS\n');
  });
})().catch(() => {
  // Never print connection URIs, prompts, provider replies or tokens.
  process.stderr.write('CI_NATIVE_BROKER_STARTUP=FAIL\n');
  process.exitCode = 1;
});
