'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const root = '/work/api/server/services/Endpoints/agents/';
const { authorizeNativeMissionRecovery } = require(root + 'nativeMissionRecoveryAuthorization.js');
const probeModule = { exports: {} };
const messages = [];
const log = { info: (line) => {
  const prefix = '[NativeMissionRecovery] Host read-only authority preflight ';
  assert.ok(line.startsWith(prefix));
  messages.push(JSON.parse(line.slice(prefix.length)));
} };
let allow = true;
let exists = true;
let claimAttempts = 0;
let viewChecks = 0;
const userId = '507f1f77bcf86cd799439011';
const candidate = {
  streamId: 'native-host-candidate', createdAt: 1700000000000,
  checkpointNamespace: 'same-generation', checkpointId: 'checkpoint-head',
};
const job = {
  ...candidate,
  status: 'running',
  providerDrained: false,
  providerExecutionId: 'provider',
  providerExecutionStartedId: 'provider',
  userId, tenantId: 'tenant-1', endpoint: 'agents',
  agent_id: 'agent-1', checkpointNamespace: candidate.checkpointNamespace,
  orchestratorPlan: { tasks: [
    { key: 'worker', agentId: 'agent-1' },
    { key: 'specialist', agentId: 'agent-2' },
  ] },
};
vm.runInNewContext(
  fs.readFileSync(root + 'nativeMissionRecoveryHostProbe.js', 'utf8'),
  {
    require: (name) => {
      switch (name) {
        case '@librechat/data-schemas': return { logger: log };
        case 'librechat-data-provider':
          return { ResourceType: { AGENT: 'agent' }, PermissionBits: { VIEW: 1 } };
        case '~/server/services/PermissionService':
          return { checkPermission: async ({resourceType,requiredPermission}) => {
            viewChecks++;
            assert.equal(resourceType, 'agent');
            assert.equal(requiredPermission, 1);
            return allow;
          }};
        case './nativeMissionRecoveryAuthorization':
          return { authorizeNativeMissionRecovery };
        default: throw Error('Unexpected dependency: ' + name);
      }
    },
    module: probeModule,
  },
);
const { createNativeMissionRecoveryHostProbe } = probeModule.exports;
const manager = {
  getJobStore() { return { getJob: async () => exists ? job : null }; },
  async getJob() { throw Error('Facade must not be materialized by a read-only audit'); },
  async claimCheckpointedOrphanForInspection() { claimAttempts++; throw Error('unsafe claim'); },
  async activateCheckpointedOrphanAfterGraphQualification() { throw Error('unsafe activation'); },
};
const deps = {
  manager, log,
  getUserById: async () => ({ _id: userId, tenantId: 'tenant-1', role: 'USER' }),
  isSubagentOwnerAdmissible: async () => true,
  getConvo: async () => ({
    conversationId: candidate.streamId, agent_id: 'agent-1', tenantId: 'tenant-1',
  }),
  getAgent: async ({ id }) => ({ id, _id: 'mongo-' + id }),
};
(async () => {
  const probe = createNativeMissionRecoveryHostProbe(deps);
  assert.equal(await probe(candidate), true);
  assert.equal(await probe(candidate), true);
  assert.equal(viewChecks, 4);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].status, 'AUTHORIZED_READ_ONLY');
  assert.equal(messages[0].gate, 'passed');
  assert.equal(claimAttempts, 0);

  allow = false;
  const denied = createNativeMissionRecoveryHostProbe(deps);
  assert.equal(await denied(candidate), false);
  assert.equal(messages[1].status, 'DENIED');
  assert.equal(messages[1].gate, 'permission');

  allow = true;
  exists = false;
  const missing = createNativeMissionRecoveryHostProbe(deps);
  assert.equal(await missing(candidate), false);
  assert.equal(messages[2].status, 'DENIED');
  assert.equal(messages[2].gate, 'job');
  assert.equal(claimAttempts, 0);

  for (const msg of messages) {
    assert.deepEqual(Object.keys(msg).sort(), ['checkpointPresent', 'gate', 'status']);
  }
  console.log('BOTMODE_HOST_READONLY_AUDIT_NO_CLAIM=PASS');
})().catch((e) => { console.error(e); process.exitCode = 1; });
