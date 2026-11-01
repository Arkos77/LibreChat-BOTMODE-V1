'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const filename = path.join(__dirname, 'nativeMissionOriginalGraphBrokerHost.js');
const source = fs.readFileSync(filename, 'utf8');
const mod = { exports: {} };
vm.runInNewContext(source, {
  module: mod,
  require: (name) => {
    if (name === './nativeMissionOriginalGraphBrokerModelFetch') {
      return { createNativeMissionOriginalGraphBrokerModelFetchFactory: () => () => () => {} };
    }
    if (name === './nativeMissionWakeupOriginStore') {
      return { canonicalMissionJson: JSON.stringify };
    }
    throw new Error('UNEXPECTED_REQUIRE: ' + name);
  },
}, { filename });

const { bindNativeMissionOriginalGraphBrokerForAcceptedMission: bind } = mod.exports;
const original = {
  userId: 'owner', conversationId: 'original-conversation',
  agentId: 'worker', originalCreatedAt: 1700000000000,
  checkpointNamespace: 'generation',
};
const plan = { planId: 'plan', tasks: [{ nodeId: 'research' }, { nodeId: 'analysis' }] };
const host = { makeMissionFetchFactory: () => () => {} };
function client(req) {
  return {
    user: undefined, conversationId: undefined,
    jobCreatedAt: original.originalCreatedAt,
    checkpointNamespace: original.checkpointNamespace,
    orchestratorPlan: plan,
    options: { req, agent: { id: original.agentId } },
  };
}
const bindIt = (c) => bind({ client: c, brokerHost: host, original, plan,
  capabilityAttestation: { mode: 'receipts_required' } });

test('fresh original client binds request owner/conversation without mutating pre-message fields', () => {
  const c = client({ user: { id: 'owner' }, body: { conversationId: 'original-conversation' } });
  assert.equal(bindIt(c), true);
  assert.equal(c.user, undefined);
  assert.equal(c.conversationId, undefined);
  assert.equal(typeof c.options.nativeGraphModelFetchFactory, 'function');
});
test('missing or mismatched authenticated request refuses broker binding', () => {
  const requests = [
    undefined,
    { user: { id: 'owner' }, body: {} },
    { user: { id: 'intruder' }, body: { conversationId: 'original-conversation' } },
    { user: { id: 'owner' }, body: { conversationId: 'other-conversation' } },
  ];
  for (const request of requests) {
    const c = client(request);
    assert.throws(() => bindIt(c), /NATIVE_GRAPH_BROKER_CLIENT_ORIGINAL_MISSION_MISMATCH/);
    assert.equal(c.options.nativeGraphModelFetchFactory, undefined);
  }
});
test('client options cannot override changed checkpoint, agent, user or conversation', () => {
  for (const mutate of [
    (c) => { c.jobCreatedAt++; },
    (c) => { c.checkpointNamespace = 'other-epoch'; },
    (c) => { c.options.agent.id = 'intruder'; },
    (c) => { c.user = 'intruder'; },
    (c) => { c.conversationId = 'other-conversation'; },
  ]) {
    const c = client({ user: { id: 'owner' }, body: { conversationId: 'original-conversation' } });
    mutate(c);
    assert.throws(() => bindIt(c), /NATIVE_GRAPH_BROKER_CLIENT_ORIGINAL_MISSION_MISMATCH/);
  }
});
test('initialized client remains accepted with matching request identity', () => {
  const c = client({ user: { id: 'owner' }, body: { conversationId: 'original-conversation' } });
  c.user = 'owner';
  c.conversationId = 'original-conversation';
  assert.equal(bindIt(c), true);
});
