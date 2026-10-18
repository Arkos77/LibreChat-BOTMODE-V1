'use strict';
const assert = require('node:assert/strict');
const {
  createNativeMissionCapabilityAttestation,
  assertNativeMissionCapabilityAttestation,
} = require('../../api/server/services/Endpoints/agents/nativeMissionCapabilityAttestation');
const plan = {
  planId: 'plan-1',
  tasks: [{ agentId: 'worker' }, { agentId: 'specialist' }],
};
const worker = { id: 'worker', provider: 'openai', model: 'gpt-4o', tools: [] };
const specialist = { id: 'specialist', provider: 'gemini', model: 'flash', tools: [] };
const args = { plan, agents: [worker, specialist] };
const recorded = createNativeMissionCapabilityAttestation(args);
assert.equal(recorded.mode, 'model_only');
assert.match(recorded.digest, /^[a-f0-9]{64}$/);
assert.deepEqual(recorded.agentIds, ['specialist', 'worker']);
assert.deepEqual(
  createNativeMissionCapabilityAttestation({ ...args, agents: [specialist, worker] }),
  recorded,
);
assert.deepEqual(assertNativeMissionCapabilityAttestation({ recorded, ...args }), recorded);
console.log('BOTMODE_ORIGINAL_MODEL_ONLY_CAPABILITY_ATTESTATION=PASS');

for (const changed of [
  { ...worker, tools: ['web_search'] },
  { ...worker, toolDefinitions: [{ name: 'execute_code' }] },
  { ...worker, toolRegistry: new Map([['tool_secret', {}]]) },
  { ...worker, subagents: { enabled: true } },
  { ...worker, subagentConfigs: [{ name: 'child' }] },
  { ...worker, subagentGraphConfigs: [{ id: 'child' }] },
  { ...worker, skills_enabled: true },
  { ...worker, tool_options: { browser: {} } },
  { ...worker, hasDeferredTools: true },
  { ...worker, codeEnvAvailable: true },
  { ...worker, actionsEnabled: true },
  { ...worker, memoryToolsRegistered: true },
  { ...worker, mcpAvailableTools: [{ name: 'remote_tool' }] },
  { ...worker, toolContextMap: { execution: {} } },
  { ...worker, dynamicToolContextMap: { secret: {} } },
  { ...worker, subagentGraphMemberMetadata: [{ id: 'extra' }] },
  { ...worker, skillCount: 1 },
  { ...worker, edges: [{ to: 'specialist' }] },
  { ...worker, model: 'gpt-4.1' },
  { ...worker, provider: 'custom' },
]) {
  const modified = { ...args, agents: [changed, specialist] };
  if (changed.model === worker.model && changed.provider === worker.provider) {
    assert.equal(createNativeMissionCapabilityAttestation(modified).mode, 'receipts_required');
  }
  assert.throws(
    () => assertNativeMissionCapabilityAttestation({ recorded, ...modified }),
    /BASELINE_CHANGED/,
  );
}
assert.equal(
  createNativeMissionCapabilityAttestation({
    ...args,
    subagentTasks: { parent: 'thread' },
  }).mode,
  'receipts_required',
);
assert.throws(
  () => assertNativeMissionCapabilityAttestation({ recorded, ...args, subagentTasks: {} }),
  /BASELINE_CHANGED/,
);
assert.throws(
  () => assertNativeMissionCapabilityAttestation({ recorded: undefined, ...args }),
  /BASELINE_MISSING/,
);
assert.throws(
  () => createNativeMissionCapabilityAttestation({ plan, agents: [worker] }),
  /AGENT_SET_MISMATCH/,
);
const repeated = createNativeMissionCapabilityAttestation({
  plan,
  agents: [worker, worker, specialist],
});
assert.equal(repeated.mode, 'model_only');
assert.equal(repeated.digest, recorded.digest);
assert.deepEqual(repeated.agentIds, ['specialist', 'worker']);
const conflicting = createNativeMissionCapabilityAttestation({
  plan,
  agents: [worker, { ...worker, tools: ['external'] }, specialist],
});
assert.equal(conflicting.mode, 'receipts_required');
assert.notEqual(conflicting.digest, recorded.digest);
assert.equal(
  createNativeMissionCapabilityAttestation({
    plan,
    agents: [specialist, worker, worker],
  }).digest,
  repeated.digest,
  'duplicate initialized snapshots must be stably fingerprinted, never discarded',
);
const withOriginalEffects = createNativeMissionCapabilityAttestation({
  ...args,
  hostEffectPathsPresent: true,
});
assert.equal(withOriginalEffects.mode, 'receipts_required');
assert.equal(withOriginalEffects.hostEffectPathsPresent, true);
assert.throws(
  () =>
    assertNativeMissionCapabilityAttestation({
      recorded: { ...recorded, hostEffectPathsPresent: true },
      ...args,
    }),
  /BASELINE_CHANGED/,
);
const originallyDelegated = createNativeMissionCapabilityAttestation({
  ...args,
  agents: [{ ...worker, subagents: { enabled: true } }, specialist],
});
assert.equal(originallyDelegated.mode, 'receipts_required');
assert.throws(
  () => assertNativeMissionCapabilityAttestation({ recorded: originallyDelegated, ...args }),
  /BASELINE_CHANGED/,
);
const descriptiveCatalog = createNativeMissionCapabilityAttestation({
  ...args,
  agents: [
    {
      ...worker,
      extensionCapabilityRegistry: {
        resources: new Map([['advertised-only-web-tool', {}]]),
      },
    },
    specialist,
  ],
});
assert.equal(descriptiveCatalog.mode, 'model_only');
assert.equal(descriptiveCatalog.digest, recorded.digest);
// Orchestrated Worker -> specialist tasks are graph edges, not an SDK tool.
// The same saved agents with optional SDK subagent delegation enabled must
// never be replayed as though their original tool surface had been empty.
const workerToSpecialistPlan = {
  ...plan,
  tasks: [
    { key: 'worker', agentId: 'worker', dependsOn: [], nodeId: 'p6_worker' },
    { key: 'specialist', agentId: 'specialist', dependsOn: ['worker'], nodeId: 'p6_specialist' },
  ],
};
const graphOnly = createNativeMissionCapabilityAttestation({
  plan: workerToSpecialistPlan,
  agents: [worker, specialist],
});
assert.equal(graphOnly.mode, 'model_only');
const delegated = createNativeMissionCapabilityAttestation({
  plan: workerToSpecialistPlan,
  agents: [{ ...worker, subagents: { enabled: true, agent_ids: ['specialist'] } }, specialist],
});
assert.equal(delegated.mode, 'receipts_required');
assert.notEqual(delegated.digest, graphOnly.digest);
assert.throws(
  () =>
    assertNativeMissionCapabilityAttestation({
      recorded: delegated,
      plan: workerToSpecialistPlan,
      agents: [worker, specialist],
    }),
  /BASELINE_CHANGED/,
);
console.log('BOTMODE_WORKER_SPECIALIST_GRAPH_VS_DELEGATION_RECEIPTS=PASS');
assert.equal(JSON.stringify(recorded).includes('secret'), false);
console.log('BOTMODE_ORIGINAL_TOOL_DELEGATION_MODEL_DRIFT_DENIAL=PASS');
