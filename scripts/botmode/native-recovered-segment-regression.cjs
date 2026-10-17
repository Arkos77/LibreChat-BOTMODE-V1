'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('/work/packages/api/src/agents/nativeMissionRecoveredSegment.ts', 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }}).outputText;
const mod = { exports: {} };
vm.runInNewContext(output, { module: mod, exports: mod.exports, AbortController, setInterval, clearInterval });
const { executeRecoveredMissionSegment } = mod.exports;
const identity = { streamId: 'c', createdAt: 1700000000000, ownerToken: 'owner', providerExecutionId: 'provider', checkpointNamespace: 'ns' };
async function run(opts = {}) {
  const calls = [];
  const store = {
    beginRecoveredMissionProviderExecution: async () => { calls.push('begin'); return !opts.denyBegin; },
    heartbeatRecoveredMissionProvider: async () => { calls.push('heartbeat'); return !opts.denyHeartbeat; },
    transitionRecoveredMissionToComplete: async () => { calls.push('terminal'); return !opts.denyTerminal; },
  };
  const config = { store, identity, leaseMs: 3000, heartbeatMs: 1000,
    assertAuthorized: async () => { calls.push('auth'); if (opts.denyAuth) throw Error('denied'); },
    assertEffectFencesReady: async () => { calls.push('fences'); if (opts.denyFence) throw Error('unsafe'); },
    continueGraph: async () => { calls.push('graph'); },
    verifyOracle: async () => { calls.push('oracle'); if (opts.denyOracle) throw Error('oracle denied'); },
    publishTerminal: async () => { calls.push('publish'); },
  };
  let error;
  try { await executeRecoveredMissionSegment(config); } catch (e) { error = e; }
  return { calls, error };
}
(async () => {
  const ok = await run();
  assert.deepEqual(ok.calls, ['auth', 'fences', 'begin', 'graph', 'auth', 'fences', 'oracle', 'auth', 'fences', 'heartbeat', 'terminal', 'publish']);
  assert.equal(ok.error, undefined);
  for (const [name, block] of [ ['denyAuth','begin'], ['denyFence','begin'], ['denyBegin','graph'],
    ['denyOracle','terminal'], ['denyHeartbeat','terminal'], ['denyTerminal','publish'] ]) {
    const result = await run({ [name]: true });
    assert.ok(result.error, name);
    assert.ok(!result.calls.includes(block), name + ' must block ' + block);
    assert.ok(!result.calls.includes('publish'), name + ' must prevent publication');
  }
  // Permissions or replay safety can change while Oracle runs.
  for (const gate of ['auth', 'fences']) {
    let checks = 0;
    const calls = [];
    const store = {
      beginRecoveredMissionProviderExecution: async () => true,
      heartbeatRecoveredMissionProvider: async () => true,
      transitionRecoveredMissionToComplete: async () => { calls.push('terminal'); return true; },
    };
    await assert.rejects(executeRecoveredMissionSegment({
      store, identity, leaseMs: 3000, heartbeatMs: 1000,
      assertAuthorized: async () => { if (gate === 'auth' && ++checks === 3) throw Error('REVOKED'); },
      assertEffectFencesReady: async () => { if (gate === 'fences' && ++checks === 3) throw Error('UNSAFE'); },
      continueGraph: async () => {}, verifyOracle: async () => {},
      publishTerminal: async () => { calls.push('publish'); },
    }), /REVOKED|UNSAFE/);
    assert.deepEqual(calls, [], 'post-Oracle revocation must prevent completion');
  }
  // A timer heartbeat still in flight must be joined before the terminal CAS.
  let completeHeartbeat;
  const held = new Promise((resolve) => { completeHeartbeat = resolve; });
  let count = 0;
  const sequence = [];
  const overlapStore = {
    beginRecoveredMissionProviderExecution: async () => true,
    heartbeatRecoveredMissionProvider: async () => {
      count++;
      if (count === 1) { await held; return false; }
      return true;
    },
    transitionRecoveredMissionToComplete: async () => { sequence.push('terminal'); return true; },
  };
  // Trigger the interval pulse during the slow graph, then let the graph end.
  let finishGraph;
  const graphDone = new Promise((resolve) => { finishGraph = resolve; });
  const pending = executeRecoveredMissionSegment({
    store: overlapStore, identity, leaseMs: 3000, heartbeatMs: 1,
    assertAuthorized: async () => {}, assertEffectFencesReady: async () => {},
    continueGraph: async () => { await graphDone; },
    verifyOracle: async () => {}, publishTerminal: async () => { sequence.push('publish'); },
  });
  await new Promise((resolve) => setTimeout(resolve, 12));
  finishGraph();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(sequence, [], 'no terminal transition while heartbeat is in flight');
  completeHeartbeat();
  await assert.rejects(pending, /OWNERSHIP_LOST/);
  assert.deepEqual(sequence, [], 'failed in-flight heartbeat must block publication');
  console.log('BOTMODE_RECOVERED_SEGMENT_FENCED_LIFECYCLE=PASS');
})().catch(e => { console.error(e); process.exitCode = 1; });
