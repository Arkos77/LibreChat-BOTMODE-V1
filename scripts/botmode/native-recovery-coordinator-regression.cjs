'use strict';
const assert = require('node:assert/strict');
const {
  createNativeMissionRecoveryCoordinator,
} = require('../../api/server/services/Endpoints/agents/nativeMissionRecoveryCoordinator');
(async () => {
  const candidate = {
    streamId: 'mission',
    createdAt: 1700000000000,
    checkpointNamespace: 'epoch',
    checkpointId: 'head',
  };
  const claim = { ...candidate, ownerToken: 'mission-owner-qualified-123' };
  async function verify({
    badClaim = false,
    denyAt = 0,
    missingFence = false,
    reconstructFails = false,
    refusesExecution = false,
  } = {}) {
    const calls = [];
    let attempts = 0;
    const store = {
      getJob: async () => ({ status: 'running' }),
      releaseDrainedMissionRecovery: async (id, at, token) => {
        assert.equal(id, candidate.streamId);
        assert.equal(at, candidate.createdAt);
        assert.equal(token, claim.ownerToken);
        calls.push('release');
        return true;
      },
    };
    const manager = {
      getJobStore: () => store,
      claimCheckpointedOrphanForInspection: async () => {
        calls.push('claim');
        return badClaim ? { ...claim, checkpointId: 'wrong' } : claim;
      },
    };
    const coordinator = createNativeMissionRecoveryCoordinator({
      manager,
      authorizeCandidate: async () => {
        calls.push('auth');
        return ++attempts !== denyAt;
      },
      reconstruct: async () => {
        calls.push('reconstruct');
        if (reconstructFails) throw Error('reconstruction failed');
        return {
          graph: { getState: async () => ({}) },
          assertReplaySafe: async () => {},
          assertEffectFencesReady: async () => {
            calls.push('fences');
            if (missingFence) throw Error('no fences');
          },
          continueGraph: async () => {},
          verifyOracle: async () => {},
          publishTerminal: async () => {},
        };
      },
      execute: async (args) => {
        calls.push('execute');
        assert.equal(args.claim.ownerToken, claim.ownerToken);
        return !refusesExecution;
      },
      log: { warn: () => {} },
    });
    let outcome, error;
    try {
      outcome = await coordinator(candidate);
    } catch (e) {
      error = e;
    }
    return { calls, outcome, error };
  }
  const passed = await verify();
  assert.equal(passed.outcome, true);
  assert.deepEqual(passed.calls, [
    'auth',
    'claim',
    'auth',
    'reconstruct',
    'fences',
    'auth',
    'execute',
  ]);
  for (const options of [
    { badClaim: true },
    { denyAt: 2 },
    { denyAt: 3 },
    { missingFence: true },
    { reconstructFails: true },
  ]) {
    const out = await verify(options);
    assert.ok(!out.calls.includes('execute'));
    assert.equal(out.calls.filter((x) => x === 'release').length, 1);
  }
  const refused = await verify({ refusesExecution: true });
  assert.equal(refused.outcome, false);
  assert.equal(refused.calls.filter((x) => x === 'release').length, 1);
  const before = await verify({ denyAt: 1 });
  assert.deepEqual(before.calls, ['auth']);
  console.log('BOTMODE_SERVER_RECOVERY_COORDINATOR_AUTH_AND_RELEASE=PASS');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
