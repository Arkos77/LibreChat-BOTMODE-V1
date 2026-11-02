'use strict';
// Real manager methods extracted from source. No provider, Mongo write, P6 or network.
// Run with Node and TypeScript available in the pinned offline qualification image.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');

const root = fs.existsSync('/work/packages/api/src/stream/GenerationJobManager.ts') ? '/work' : process.cwd();
const file = path.join(root, 'packages/api/src/stream/GenerationJobManager.ts');
const tree = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
const cls = tree.statements.find((x) => ts.isClassDeclaration(x) && x.name?.text === 'GenerationJobManagerClass');
assert.ok(cls, 'manager class missing');
const names = ['markOrphanedNativeMissionOutcomeUnknown', 'dispatchCheckpointedOrphanedNativeMissions'];
const methods = names.map((name) => {
  const member = cls.members.find((x) => ts.isMethodDeclaration(x) && x.name.getText(tree) === name);
  assert.ok(member, name);
  return member.getText(tree);
});
const box = { exports: null };
const code = ts.transpileModule('class Harness {' + methods.join('\n') + '}\nmodule.exports=Harness;', {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
vm.runInNewContext(code, { module: box, Date, Object, Promise, logger: { warn() {} } });
const Harness = box.exports;
const candidate = Object.freeze({
  streamId: 'mission-abc', createdAt: 1700000000000,
  checkpointNamespace: 'generation-ns', checkpointId: 'checkpoint-head',
});
const valid = {
  ...candidate, status: 'running', providerDrained: false,
  providerExecutionId: 'provider-1', providerExecutionStartedId: 'provider-1',
  orchestratorPlan: { tasks: [{ key: 'research' }, { key: 'analysis' }] },
};
function make(overrides = {}) {
  let job = { ...valid };
  let claims = 0;
  let releases = 0;
  let transitions = 0;
  let providers = 0;
  let publications = 0;
  let claimAvailable = true;
  const store = {
    getJob: async () => ({ ...job }),
    claimDrainedMissionRecovery: async () => true,
    releaseDrainedMissionRecovery: async (...args) => {
      assert.equal(args[0], candidate.streamId);
      assert.equal(args[1], candidate.createdAt);
      assert.equal(args[2], 'owner-token');
      releases++;
      return true;
    },
    transitionStatus: async (id, args) => {
      transitions++;
      assert.equal(id, candidate.streamId);
      assert.equal(args.from, 'running');
      assert.equal(args.to, 'error');
      assert.equal(args.expectCreatedAt, candidate.createdAt);
      assert.equal(args.patch.error, 'OUTCOME_UNKNOWN');
      assert.equal(typeof args.patch.completedAt, 'number');
      assert.ok(job.status === 'running' && job.createdAt === args.expectCreatedAt);
      if (overrides.casLost) return false;
      job = { ...job, ...args.patch, status: 'error' };
      return true;
    },
  };
  const manager = new Harness();
  manager._isRedis = true;
  manager.shuttingDown = false;
  manager.nativeMissionRecoveryHandler = null;
  manager.nativeMissionRecoveryInFlight = new Set();
  manager.jobStore = store;
  manager.inspectCheckpointedOrphanedNativeMissions = async () => [candidate];
  manager.claimCheckpointedOrphanForInspection = async () => {
    claims++;
    if (!claimAvailable) return null;
    return { ...candidate, ownerToken: 'owner-token' };
  };
  manager.startProvider = async () => { providers++; throw Error('PROVIDER_REPLAY_FORBIDDEN'); };
  manager.publish = async () => { publications++; throw Error('P6_PUBLICATION_FORBIDDEN'); };
  return { manager, store, get job() { return job; }, set job(j) { job = j; },
    get claims() { return claims; }, get releases() { return releases; },
    get transitions() { return transitions; }, get providers() { return providers; },
    get publications() { return publications; },
    disallowClaim() { claimAvailable = false; } };
}
(async () => {
  const a = make();
  await a.manager.dispatchCheckpointedOrphanedNativeMissions();
  assert.equal(a.job.status, 'error');
  assert.equal(a.job.error, 'OUTCOME_UNKNOWN');
  assert.equal(a.claims, 1);
  assert.equal(a.releases, 1);
  assert.equal(a.transitions, 1);
  assert.equal(a.providers, 0);
  assert.equal(a.publications, 0);
  console.log('BOTMODE_ORPHAN_UNKNOWN_PERSISTED_NO_REPLAY_NO_P6=PASS');

  await a.manager.dispatchCheckpointedOrphanedNativeMissions();
  assert.equal(a.transitions, 1, 'idempotent after terminal error');
  assert.equal(a.releases, 2);
  console.log('BOTMODE_ORPHAN_UNKNOWN_NO_SECOND_SETTLEMENT=PASS');

  const b = make(); b.disallowClaim();
  await b.manager.dispatchCheckpointedOrphanedNativeMissions();
  assert.equal(b.transitions, 0);
  assert.equal(b.job.status, 'running');
  console.log('BOTMODE_LIVE_OR_UNCLAIMED_PROVIDER_UNTOUCHED=PASS');

  const c = make(); c.job = { ...valid, providerExecutionStartedId: 'other-provider' };
  await c.manager.dispatchCheckpointedOrphanedNativeMissions();
  assert.equal(c.transitions, 0); assert.equal(c.releases, 1);
  const d = make(); d.job = { ...valid, createdAt: valid.createdAt + 1 };
  await d.manager.dispatchCheckpointedOrphanedNativeMissions();
  assert.equal(d.transitions, 0); assert.equal(d.releases, 1);
  const e = make(); e.job = { ...valid, status: 'complete' };
  await e.manager.dispatchCheckpointedOrphanedNativeMissions();
  assert.equal(e.transitions, 0); assert.equal(e.releases, 1);
  const f = make(); f.job = { ...valid, orchestratorPlan: undefined };
  await f.manager.dispatchCheckpointedOrphanedNativeMissions();
  assert.equal(f.transitions, 0); assert.equal(f.releases, 1);
  console.log('BOTMODE_UNKNOWN_IDENTITY_PLAN_TERMINAL_GUARDS=PASS');

  const g = make({casLost: true});
  await g.manager.dispatchCheckpointedOrphanedNativeMissions();
  assert.equal(g.job.status, 'running'); assert.equal(g.releases, 1);
  console.log('BOTMODE_UNKNOWN_LOST_CAS_CANNOT_OVERWRITE=PASS');

  const h = make();
  h.manager.claimCheckpointedOrphanForInspection = async () => ({...candidate, checkpointId: 'changed-head', ownerToken: 'owner-token'});
  await h.manager.dispatchCheckpointedOrphanedNativeMissions();
  assert.equal(h.transitions, 0); assert.equal(h.releases, 1);
  console.log('BOTMODE_UNKNOWN_CHECKPOINT_DRIFT_REFUSED=PASS');

  const i = make(); i.store.claimDrainedMissionRecovery = undefined;
  i.manager.inspectCheckpointedOrphanedNativeMissions = async () => { throw Error('unsupported store must not scan'); };
  await i.manager.dispatchCheckpointedOrphanedNativeMissions();
  assert.equal(i.transitions, 0);
  console.log('BOTMODE_UNKNOWN_UNSUPPORTED_STORE_FAIL_CLOSED=PASS');
})().catch((err) => { console.error(err); process.exitCode = 1; });
