'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture({ commitReceipt = true } = {}) {
  const actions = [];
  const candidate = {
    streamId: 'original', createdAt: 1700000000000,
    checkpointNamespace: 'generation', checkpointId: 'head',
  };
  const claim = { ...candidate, ownerToken: 'long-original-owner-token' };
  const plan = {
    planId: 'plan',
    tasks: [
      { nodeId: 'research', agentId: 'researcher', taskId: 'r' },
      { nodeId: 'analysis', agentId: 'analyst', taskId: 'a' },
    ],
  };
  const job = {
    createdAt: candidate.createdAt, userId: 'owner', tenantId: '',
    responseMessageId: 'response', orchestratorPlan: plan,
  };
  const store = { getJob: async () => job };
  const manager = { getJobStore: () => store };
  const client = {
    options: {},
    orchestratorPlan: plan,
    getReachableMissionAgents: () => [
      { id: 'researcher', provider: 'OpenRouter', model: 'free' },
      { id: 'analyst', provider: 'OpenRouter', model: 'free' },
    ],
  };
  const noop = async () => true;
  const dependencies = {
    'librechat-data-provider': {
      ResourceType: { AGENT: 'agent' }, PermissionBits: { VIEW: 'view' },
    },
    '~/server/services/PermissionService': { checkPermission: noop },
    './nativeMissionRecoveryHostAuthorization': {
      createNativeMissionRecoveryHostAuthorization: () => noop,
    },
    './nativeMissionAuthorizedClientInitializer': {
      createNativeMissionAuthorizedClientInitializer: () => async () => ({ client, job }),
    },
    './nativeMissionRecoveryHandlerFactory': {
      createNativeMissionRecoveryHandlerFactory: (options) => options,
    },
    './nativeMissionModelOnlyRecoveryCallbacks': {
      createNativeMissionModelOnlyRecoveryCallbacks: () => ({
        oracle: noop, publication: noop,
      }),
    },
    './nativeMissionCheckpointedAnalysisReplay': {
      createNativeMissionCheckpointedAnalysisReplay: () => ({
        verify: async () => { actions.push('verify-checkpoint'); return 'analysis'; },
        effectFences: noop, replaySafety: noop,
      }),
    },
    './nativeMissionColdBrokerTransportInstaller': {
      createNativeMissionColdBrokerTransportInstaller: () => async () => ({
        bindGraph: async () => { actions.push('bind-graph'); return true; },
      }),
    },
    './nativeMissionColdGraphReceiptProof': {
      createNativeMissionColdGraphReceiptProof: () => async ({ identity }) => {
        actions.push('read-original-receipt');
        assert.equal(identity.nodeId, 'analysis');
        assert.equal(identity.provider, 'openrouter');
        assert.equal(identity.model, 'free');
        if (!commitReceipt) throw new Error('ORIGINAL_MODEL_RECEIPT_NOT_COMMITTED');
        return { identity, requestDigest: 'a'.repeat(64) };
      },
    },
  };
  const filename = path.join(__dirname, 'nativeMissionReceiptsRequiredRecoveryHandler.js');
  const source = fs.readFileSync(filename, 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(source, {
    require: (name) => {
      if (!Object.hasOwn(dependencies, name)) throw Error('Unexpected import ' + name);
      return dependencies[name];
    },
    module,
  }, { filename });
  const create = module.exports.createNativeMissionReceiptsRequiredRecoveryHandler;
  const handler = create({
    manager,
    brokerHost: { makeRecoveryFetchFactoryWithReader: noop },
    getOriginal: noop, intentStore: { readOriginalIntent: noop },
    providerReceiptStore: { readOriginalNativeGraph: noop },
    getUserById: noop, isSubagentOwnerAdmissible: noop, getConvo: noop,
    getAgent: noop, initializeClientFromDocuments: noop, createRun: noop,
    validateMissionTask: noop, normalizeMissionOracleState: noop,
    areMissionOracleResultsEquivalent: noop, qualifyAndExecuteRecoveredMissionSegment: noop,
    continueColdNativeMissionGraph: noop, getMessage: noop, saveMessage: noop,
    sanitizeMessage: noop, emitDone: noop, log: { warn: () => {} },
  });
  return { handler, client, candidate, claim, actions };
}
test('production assembly refuses replay proof before original broker receipt is committed', async () => {
  const f = fixture();
  const coords = { candidate: f.candidate, claim: f.claim, assertAuthorized: async () => true };
  await f.handler.initializeAuthorizedClient(coords);
  await assert.rejects(
    f.client.options.nativeMissionReplayReceiptProof({
      candidate: f.candidate, claim: f.claim,
    }), /ORIGINAL_RECEIPT_MISSING/,
  );
  assert.deepEqual(f.actions, []);
});
test('production assembly binds broker, proves original model receipt, then permits replay proof', async () => {
  const f = fixture();
  const coords = { candidate: f.candidate, claim: f.claim, assertAuthorized: async () => true };
  await f.handler.initializeAuthorizedClient(coords);
  const binder = await f.handler.installRecoveryTransport({ client: f.client });
  const graph = { getState: async () => {}, invoke: async () => {} };
  assert.equal(await binder.bindGraph(graph), true);
  assert.equal(await f.handler.proveColdGraphReceipt({ client: f.client, graph, ...coords }), true);
  assert.equal(await f.client.options.nativeMissionReplayReceiptProof({
    candidate: f.candidate, claim: f.claim,
  }), true);
  assert.deepEqual(f.actions, [
    'bind-graph', 'verify-checkpoint', 'read-original-receipt', 'verify-checkpoint',
  ]);
});
test('uncommitted original model receipt can never authorize replay', async () => {
  const f = fixture({ commitReceipt: false });
  const coords = { candidate: f.candidate, claim: f.claim, assertAuthorized: async () => true };
  await f.handler.initializeAuthorizedClient(coords);
  const binder = await f.handler.installRecoveryTransport({ client: f.client });
  const graph = {};
  await binder.bindGraph(graph);
  await assert.rejects(
    f.handler.proveColdGraphReceipt({ client: f.client, graph, ...coords }),
    /ORIGINAL_MODEL_RECEIPT_NOT_COMMITTED/,
  );
  await assert.rejects(
    f.client.options.nativeMissionReplayReceiptProof({
      candidate: f.candidate, claim: f.claim,
    }), /ORIGINAL_RECEIPT_MISSING/,
  );
});
