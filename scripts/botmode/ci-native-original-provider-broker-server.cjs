#!/usr/bin/env node
'use strict';

/**
 * Disposable GitHub-runner broker for REAL native specialist operations.
 * Runs in a separate container from the API. Unlike the pre-existing smoke
 * server, every authorization depends on Mongo's current user, ACL, agent,
 * mission, task start, lease, journal reservation, and original graph tuple.
 * The only upstream is an operator-owned runner-local model fixture.
 */
const path = require('node:path');
require('module-alias')({ base: path.resolve(__dirname, '../../api') });
const mongoose = require('mongoose');
const { ResourceType, PermissionBits } = require('librechat-data-provider');
const { getAgentCheckpointer } = require('@librechat/api');
const db = require('~/models');
const { checkPermission } = require('../../api/server/services/PermissionService');
const {
  createFixedLocalProviderSender,
} = require('../../api/server/services/Endpoints/agents/nativeMissionProviderBrokerHttp');
const {
  createNativeMissionOriginalChildCheckpointReader,
} = require('../../api/server/services/Endpoints/agents/nativeMissionOriginalChildCheckpointReader');
const {
  getNativeMissionWakeupOrigin,
  assertNativeMissionOriginalGenerationNamespace,
} = require('../../api/server/services/Endpoints/agents/nativeMissionWakeupOriginStore');
const {
  createNativeMissionIndependentOriginalBrokerServer,
} = require('../../api/server/services/Endpoints/agents/nativeMissionIndependentOriginalBrokerServer');

const validCI =
  process.env.BOTMODE_CI_ORIGINAL_BROKER === '1' &&
  process.env.COMPOSE_PROJECT_NAME?.startsWith('botmode-pr107-head-') === true;
if (!validCI) throw new Error('NATIVE_ORIGINAL_BROKER_CI_ONLY');

const secret = process.env.BOTMODE_CI_ORIGINAL_BROKER_SECRET;
const mongoUri = process.env.BOTMODE_CI_ORIGINAL_MONGO_URI;
const fixtureUrl = process.env.BOTMODE_CI_ORIGINAL_FIXTURE_URL;
if (typeof secret !== 'string' || secret.length < 32 || !mongoUri || !fixtureUrl) {
  throw new Error('NATIVE_ORIGINAL_BROKER_CI_CONFIG_MISSING');
}
const mongo = new URL(mongoUri);
if (
  mongo.protocol !== 'mongodb:' ||
  !['mongodb', '127.0.0.1', 'localhost'].includes(mongo.hostname) ||
  mongo.password.length === 0
) {
  throw new Error('NATIVE_ORIGINAL_BROKER_CI_MONGO_DENIED');
}

const normalizedProvider = (value) => (value === 'OpenRouter' ? 'openrouter' : value);
const currentOwner = async ({ userId, tenantId }) => {
  if (typeof userId !== 'string' || userId.length === 0) return false;
  const [user, admitted] = await Promise.all([
    db.getUserById(userId),
    db.isSubagentOwnerAdmissible(userId),
  ]);
  return (
    admitted === true &&
    String(user?._id ?? user?.id ?? '') === userId &&
    (user?.tenantId ?? '') === (tenantId ?? '')
  );
};
const canViewAgent = async ({ userId, tenantId, agentId }) => {
  if (!(await currentOwner({ userId, tenantId }))) return false;
  const [agent, user] = await Promise.all([db.getAgent({ id: agentId }), db.getUserById(userId)]);
  if (agent?.id !== agentId || agent._id == null || user == null) return false;
  return (
    (await checkPermission({
      userId,
      role: user.role,
      resourceType: ResourceType.AGENT,
      resourceId: agent._id,
      requiredPermission: PermissionBits.VIEW,
    })) === true
  );
};
const inspectOriginalChildOwner = async (scope) => {
  if (!(await currentOwner(scope))) return false;
  const leases = await db.listActiveSubagentThreadLeases({
    user: scope.userId,
    tenantId: scope.tenantId,
    now: new Date(),
  });
  return (
    Array.isArray(leases) &&
    leases.some(
      (lease) =>
        lease.parentConversationId === scope.parentConversationId &&
        lease.taskId === scope.taskId &&
        [lease.threadId, lease.childThreadId, lease.childConversationId].includes(
          scope.childThreadId,
        ) &&
        (lease.attemptKey == null || lease.attemptKey === scope.attemptKey),
    )
  );
};
const getStartReceipt = ({ userId, messageId }) => db.getMessage({ user: userId, messageId });

(async () => {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  const collection = mongoose.connection.db.collection('native_mission_provider_calls');
  const readOriginalCheckpoint = createNativeMissionOriginalChildCheckpointReader({
    getCheckpointer: () => getAgentCheckpointer(undefined),
    getConvo: db.getConvo,
    getStartReceipt,
    assertGenerationNamespace: (scope) =>
      assertNativeMissionOriginalGenerationNamespace({
        ...scope,
        getConvo: db.getConvo,
      }),
  });
  const server = createNativeMissionIndependentOriginalBrokerServer({
    collection,
    secret,
    provider: 'openrouter',
    sendProvider: createFixedLocalProviderSender({
      url: fixtureUrl,
      allowCiDockerHost: true,
    }),
    findOriginalOperation: ({ callKey }) => collection.findOne({ callKey }),
    getMissionOrigin: getNativeMissionWakeupOrigin,
    getConvo: db.getConvo,
    getStartReceipt,
    readOriginalCheckpoint,
    authorizeCurrentOwner: currentOwner,
    canViewAgent,
    inspectOriginalChildOwner,
    getCurrentModelBinding: async ({ agentId }) => {
      const agent = await db.getAgent({ id: agentId });
      return {
        provider: normalizedProvider(agent?.provider),
        model: agent?.model_parameters?.model ?? agent?.model,
      };
    },
  });
  const shutdown = () => {
    server.closeAllConnections();
    server.close(() => void mongoose.disconnect());
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  server.listen(8096, '0.0.0.0', () => {
    process.stdout.write('CI_ORIGINAL_BROKER_WITH_LIVE_MONGO_READY=PASS\n');
  });
})().catch((error) => {
  // No IDs, model messages, keys, credentials or connection strings.
  const allowed = [
    'NATIVE_ORIGINAL_BROKER_CI_CONFIG_MISSING',
    'NATIVE_ORIGINAL_BROKER_CI_MONGO_DENIED',
    'NATIVE_BROKER_ORIGINAL_AUTH_DEPENDENCIES',
  ];
  process.stderr.write(
    'CI_ORIGINAL_BROKER_BOOT=' +
      (allowed.includes(error?.code ?? error?.message)
        ? (error.code ?? error.message)
        : (error?.name ?? 'FAIL')) +
      '\n',
  );
  process.exitCode = 1;
});
