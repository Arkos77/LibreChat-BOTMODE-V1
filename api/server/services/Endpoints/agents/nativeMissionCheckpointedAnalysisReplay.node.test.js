'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createNativeMissionCheckpointedAnalysisReplay } =
  require('./nativeMissionCheckpointedAnalysisReplay');
const { createNativeMissionCapabilityAttestation } =
  require('./nativeMissionCapabilityAttestation');

function fixture() {
  const candidate = {
    streamId: 'original', createdAt: 1700000000000,
    checkpointNamespace: 'generation', checkpointId: 'saved-head',
  };
  const claim = { ...candidate, ownerToken: 'original-cold-owner-token' };
  const plan = { planId: 'original-plan', tasks: [
    { key: 'research', nodeId: 'research-node', taskId: 'research-task',
      agentId: 'researcher', dependsOn: [] },
    { key: 'analysis', nodeId: 'analysis-node', taskId: 'analysis-task',
      agentId: 'analyst', dependsOn: ['research'] },
  ] };
  const agents = [
    { id: 'worker', provider: 'openrouter', model: 'free' },
    { id: 'researcher', provider: 'openrouter', model: 'free', tools: ['web_search'] },
    { id: 'analyst', provider: 'openrouter', model: 'free' },
  ];
  const baseline = createNativeMissionCapabilityAttestation({ plan, agents });
  assert.equal(baseline.mode, 'receipts_required');
  const job = {
    streamId: candidate.streamId, createdAt: candidate.createdAt,
    checkpointNamespace: candidate.checkpointNamespace,
    status: 'running', pendingAction: null,
    agent_id: 'worker', orchestratorPlan: plan,
    nativeMissionCapabilityAttestation: baseline,
  };
  const state = {
    config: { configurable: {
      thread_id: candidate.streamId,
      __librechat_checkpoint_ns: candidate.checkpointNamespace,
      checkpoint_id: candidate.checkpointId,
    } },
    next: ['analysis-node'],
    tasks: [{ name: 'analysis-node', interrupts: [] }],
    values: { agentOutputs: { 'research-node': { content: 'completed research' } } },
  };
  const actions = [];
  const client = {
    conversationId: candidate.streamId,
    jobCreatedAt: candidate.createdAt,
    checkpointNamespace: candidate.checkpointNamespace,
    orchestratorPlan: plan,
    options: { agent: { id: 'worker' },
      nativeGraphModelFetchFactory: () => null,
      nativeMissionRecoveryRequiresReceipts: true,
    },
    getReachableMissionAgents: () => agents,
  };
  const graph = { getState: async () => {
    actions.push('read-original-head');
    return state;
  } };
  const store = {
    getJob: async () => { actions.push('read-original-job'); return job; },
  };
  const manager = { getJobStore: () => store };
  const replay = createNativeMissionCheckpointedAnalysisReplay({ manager });
  const context = {
    client, graph, candidate, claim,
    assertAuthorized: async () => { actions.push('authorize'); },
  };
  return { candidate, claim, plan, agents, job, state, actions, replay, context };
}

test('only saved Research and pending tool-free Analyse can be admitted', async () => {
  const f = fixture();
  assert.equal(await f.replay.verify(f.context), 'analysis-node');
  const fences = await f.replay.effectFences(f.context);
  assert.equal(await fences(), true);
  const safe = await f.replay.replaySafety(f.context);
  assert.equal(await safe(['analysis-node']), true);
  assert.ok(f.actions.includes('read-original-head'));
});
test('a pending Research node is never permitted to replay', async () => {
  const f = fixture();
  f.state.next = ['research-node'];
  f.state.tasks[0].name = 'research-node';
  await assert.rejects(f.replay.verify(f.context), /PREDECESSOR_NOT_DURABLE/);
  assert.ok(!f.actions.includes('invoke'));
});
test('changed head, missing Research output or interrupted task fails closed', async () => {
  for (const mutate of [
    (f) => { f.state.config.configurable.checkpoint_id = 'other'; },
    (f) => { delete f.state.values.agentOutputs['research-node']; },
    (f) => { f.state.values.agentOutputs['analysis-node'] = { content: 'premature' }; },
    (f) => { f.state.tasks[0].interrupts = [{ value: 'approval' }]; },
  ]) {
    const f = fixture();
    mutate(f);
    await assert.rejects(f.replay.verify(f.context), /PREDECESSOR_NOT_DURABLE/);
  }
});
test('unknown or non-read-only tools on either specialist fail closed', async () => {
  for (const mutate of [
    (f) => { f.agents[1].tools.push('send_email'); },
    (f) => { f.agents[2].tools = ['web_search']; },
    (f) => { f.agents[2].subagentConfigs = [{ name: 'executor' }]; },
  ]) {
    const f = fixture();
    mutate(f);
    await assert.rejects(f.replay.verify(f.context),
      /CAPABILITY_BASELINE_CHANGED|EFFECT_SURFACE_UNSUPPORTED/);
  }
});
test('unchanged original two-node plan and exact recovered owner are mandatory', async () => {
  const f = fixture();
  await assert.rejects(f.replay.verify({
    ...f.context, claim: { ...f.claim, checkpointId: 'other' },
  }), /IDENTITY_DENIED/);
  f.plan.tasks[1].dependsOn = [];
  await assert.rejects(f.replay.verify(f.context),
    /PLAN_DENIED|CAPABILITY_BASELINE_CHANGED/);
});
test('replay only admits the sole pending analysis node', async () => {
  const f = fixture();
  const safe = await f.replay.replaySafety(f.context);
  await assert.rejects(safe(['research-node']), /PENDING_NODE_DENIED/);
  await assert.rejects(safe(['analysis-node', 'research-node']), /PENDING_NODE_DENIED/);
});
