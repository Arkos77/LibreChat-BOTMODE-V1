'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createNativeMissionCapabilityAttestation } =
  require('./nativeMissionCapabilityAttestation');
const { committedResearchRecoveryShape, assertColdResearchCapabilityBaseline } =
  require('./nativeMissionColdCommittedResearchAdmission');
const plan = {
  planId: 'signed', mission: { researchExecutionVersion: 1 },
  tasks: [
    { key: 'research', nodeId: 'node-research', agentId: 'researcher',
      dependsOn: [], requiredCapabilities: ['web_search'],
      validation: [{ outputContract: 'research-v1' }] },
    { key: 'analysis', nodeId: 'node-analysis', agentId: 'analyst',
      dependsOn: ['research'], requiredCapabilities: [], validation: [] },
  ],
};
function fixture(backgroundTasks) {
  const docs = [
    { id: 'worker', provider: 'openrouter', model: 'free', tools: [],
      subagents: { enabled: true, agent_ids: ['researcher', 'analyst'] } },
    { id: 'researcher', provider: 'openrouter', model: 'free',
      tools: ['web_search'] },
    { id: 'analyst', provider: 'openrouter', model: 'free', tools: [] },
  ];
  // Original SDK registers the single research tool definition; cold
  // recovery preserves its name, never an executable instance or a queue.
  const runtime = docs.map((a) => ({ ...a,
    tools: [], toolDefinitions: a.id === 'researcher' ? [{ name: 'web_search' }] : [],
  }));
  const recorded = createNativeMissionCapabilityAttestation({
    plan, agents: runtime, subagentTasks: backgroundTasks ? { store: 'original' } : undefined,
  });
  return { job: { agent_id: 'worker', orchestratorPlan: plan,
    nativeMissionCapabilityAttestation: recorded }, docs, runtime, recorded };
}
test('only the signed, two-agent research-v1 history may carry inert web_search', () => {
  const f = fixture(true);
  assert.equal(committedResearchRecoveryShape({ job: f.job, documents: f.docs })
    .researchAgentId, 'researcher');
  f.docs[0].subagents.agent_ids.push('code-agent', 'docs-agent', 'writer-agent');
  assert.equal(committedResearchRecoveryShape({ job: f.job, documents: f.docs })
    .researchAgentId, 'researcher');
  for (const alter of [
    (x) => { x.docs[2].tools = ['send_email']; },
    (x) => { x.docs[0].tools = ['web_search', 'send_email']; },
    (x) => { x.docs[0].tools = 'web_search'; },
    (x) => { x.docs[1].tools = ['web_search', 'file_search']; },
    (x) => { x.docs[1].skills_enabled = true; },
    (x) => { x.docs[0].subagents.agent_ids.push('researcher'); },
    (x) => { x.job.orchestratorPlan.mission.researchExecutionVersion = 0; },
    (x) => { x.job.orchestratorPlan.tasks[0].validation = []; },
    (x) => { x.job.nativeMissionCapabilityAttestation.mode = 'model_only'; },
    (x) => { x.docs[1].tool_options = { web_search: { unsafe: true } }; },
    (x) => { x.docs[0].files = ['file-id']; },
  ]) {
    const mutated = fixture(true);
    mutated.docs[0].subagents = { ...mutated.docs[0].subagents,
      agent_ids: [...mutated.docs[0].subagents.agent_ids] };
    mutated.job.orchestratorPlan = JSON.parse(JSON.stringify(plan));
    mutated.job.nativeMissionCapabilityAttestation = { ...mutated.recorded };
    alter(mutated);
    assert.equal(committedResearchRecoveryShape({
      job: mutated.job, documents: mutated.docs,
    }), null);
  }
});
test('the real onboarding Worker web_search is inert during recovery yet signed', () => {
  const f = fixture(true);
  f.docs[0].tools = ['web_search'];
  const shape = committedResearchRecoveryShape({ job: f.job, documents: f.docs });
  assert.deepEqual(shape.historicalWebToolAgentIds, ['worker', 'researcher']);
  const cold = f.runtime.map(a => ({
    ...a, tools: [],
    toolDefinitions: shape.historicalWebToolAgentIds.includes(a.id)
      ? [{ name: 'web_search' }] : [],
  }));
  const original = f.runtime.map(a => ({
    ...a, tools: shape.historicalWebToolAgentIds.includes(a.id)
      ? [{ name: 'web_search' }] : [],
    toolDefinitions: shape.historicalWebToolAgentIds.includes(a.id)
      ? [{ name: 'web_search' }] : [],
  }));
  const recorded = createNativeMissionCapabilityAttestation({
    plan, agents: original, subagentTasks: { store: 'original' },
  });
  assert.equal(assertColdResearchCapabilityBaseline({
    recorded, plan, agents: cold, historicalWebToolAgentIds: shape.historicalWebToolAgentIds,
  }), true);
  assert.throws(() => assertColdResearchCapabilityBaseline({
    recorded, plan, agents: cold,
  }), /BASELINE_CHANGED/);
  assert.ok(cold.every(a => !a.tools.length));
});
test('original subagent queue bit may be proven by hash but cannot be recreated', () => {
  for (const hadQueue of [false, true]) {
    const f = fixture(hadQueue);
    assert.equal(assertColdResearchCapabilityBaseline({
      recorded: f.recorded, plan, agents: f.runtime,
    }), true);
    const changed = f.runtime.map(a => a.id === 'researcher'
      ? { ...a, toolDefinitions: [] } : a);
    assert.throws(() => assertColdResearchCapabilityBaseline({
      recorded: f.recorded, plan, agents: changed,
    }), /BASELINE_CHANGED/);
  }
});
test('no missing research tool or model-only snapshot can authorize receipt path', () => {
  const f = fixture(true);
  assert.throws(() => assertColdResearchCapabilityBaseline({
    recorded: { ...f.recorded, mode: 'model_only' }, plan, agents: f.runtime,
  }), /MODE_DENIED/);
});
