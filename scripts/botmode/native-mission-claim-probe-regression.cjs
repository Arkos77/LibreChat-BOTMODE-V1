'use strict';
const assert = require('node:assert/strict');
const { createNativeMissionRecoveryClaimProbe } = require(
  '/work/api/server/services/Endpoints/agents/nativeMissionRecoveryClaimProbe.js',
);
const candidate = Object.freeze({
  streamId: 'mission-1',
  createdAt: 1700000000000,
  checkpointNamespace: '1700000000000',
  checkpointId: 'head-1',
});
const originalClaim = { ...candidate, ownerToken: 'mission-claim-owner-token-123456' };

async function scenario({
  authBefore = true,
  authAfter = true,
  claimAvailable = true,
  claimOverrides = {},
  claimThrows = false,
  releaseThrows = false,
  releaseResult = true,
  swapStore = false,
  revokeAfterClaim = false,
} = {}) {
  const calls = { authorize: 0, claim: 0, release: 0, models: 0, published: 0 };
  const events = [];
  const store = {
    getJob: async () => ({ streamId: candidate.streamId, status: 'running' }),
    releaseDrainedMissionRecovery: async (streamId, createdAt, token) => {
      calls.release++;
      assert.equal(streamId, candidate.streamId);
      assert.equal(createdAt, candidate.createdAt);
      assert.equal(token, originalClaim.ownerToken);
      if (releaseThrows) throw new Error('redis-release-offline');
      return releaseResult;
    },
  };
  let currentStore = store;
  let authorized = authBefore;
  const manager = {
    getJobStore: () => currentStore,
    claimCheckpointedOrphanForInspection: async (stream, createdAt) => {
      calls.claim++;
      assert.equal(stream, candidate.streamId);
      assert.equal(createdAt, candidate.createdAt);
      if (claimThrows) throw new Error('redis-claim-offline');
      if (swapStore) currentStore = {};
      if (revokeAfterClaim) authorized = false;
      return claimAvailable ? { ...originalClaim, ...claimOverrides } : null;
    },
    runProvider: () => { calls.models++; throw Error('model forbidden'); },
    publishOracle: () => { calls.published++; throw Error('publication forbidden'); },
  };
  const probe = createNativeMissionRecoveryClaimProbe({
    manager,
    authorizeCandidate: async () => {
      calls.authorize++;
      return calls.authorize === 1 ? authBefore : authorized && authAfter;
    },
    log: {
      info: (event) => events.push(event),
      warn: (event) => events.push(event),
    },
  });
  return { calls, events, probe };
}
(async () => {
  let setup = await scenario();
  assert.equal(await setup.probe(candidate), true);
  assert.deepEqual(setup.calls, {
    authorize: 2, claim: 1, release: 1, models: 0, published: 0,
  });
  assert.match(setup.events.at(-1), /"qualified":true,"released":true/);

  setup = await scenario({ authBefore: false });
  assert.equal(await setup.probe(candidate), false);
  assert.equal(setup.calls.claim, 0);
  assert.equal(setup.calls.release, 0);

  setup = await scenario({ authAfter: false });
  assert.equal(await setup.probe(candidate), false);
  assert.equal(setup.calls.release, 1);

  setup = await scenario({ revokeAfterClaim: true });
  assert.equal(await setup.probe(candidate), false);
  assert.equal(setup.calls.release, 1);

  setup = await scenario({ claimAvailable: false });
  assert.equal(await setup.probe(candidate), false);
  assert.equal(setup.calls.release, 0);

  for (const mismatch of [
    { checkpointId: 'stale' },
    { checkpointNamespace: 'swapped' },
    { createdAt: candidate.createdAt + 1 },
    { streamId: 'replaced' },
  ]) {
    setup = await scenario({ claimOverrides: mismatch });
    assert.equal(await setup.probe(candidate), false);
    assert.equal(setup.calls.release, 1);
  }

  setup = await scenario({ swapStore: true });
  assert.equal(await setup.probe(candidate), false);
  assert.equal(setup.calls.release, 1);

  setup = await scenario({ releaseResult: false });
  assert.equal(await setup.probe(candidate), false);
  assert.equal(setup.calls.release, 1);

  setup = await scenario({ releaseThrows: true });
  await assert.rejects(setup.probe(candidate), /redis-release-offline/);
  assert.equal(setup.calls.release, 1);

  setup = await scenario({ claimThrows: true });
  await assert.rejects(setup.probe(candidate), /redis-claim-offline/);
  assert.equal(setup.calls.release, 0);
  console.log('BOTMODE_NATIVE_CLAIM_PROBE_ADMISSION_AND_RELEASE=PASS');
})().catch((error) => { console.error(error); process.exitCode = 1; });
