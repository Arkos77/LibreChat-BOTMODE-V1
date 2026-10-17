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
  assert.deepEqual(ok.calls, ['auth', 'fences', 'begin', 'graph', 'auth', 'fences', 'oracle', 'heartbeat', 'terminal', 'publish']);
  assert.equal(ok.error, undefined);
  for (const [name, block] of [ ['denyAuth','begin'], ['denyFence','begin'], ['denyBegin','graph'],
    ['denyOracle','terminal'], ['denyHeartbeat','terminal'], ['denyTerminal','publish'] ]) {
    const result = await run({ [name]: true });
    assert.ok(result.error, name);
    assert.ok(!result.calls.includes(block), name + ' must block ' + block);
    assert.ok(!result.calls.includes('publish'), name + ' must prevent publication');
  }
  console.log('BOTMODE_RECOVERED_SEGMENT_FENCED_LIFECYCLE=PASS');
})().catch(e => { console.error(e); process.exitCode = 1; });
