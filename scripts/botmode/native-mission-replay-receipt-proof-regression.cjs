'use strict';
const assert = require('node:assert/strict');
const {
  createNativeMissionReplayReceiptProof,
} = require('../../api/server/services/Endpoints/agents/nativeMissionReplayReceiptProof');
(async () => {
  const candidate = {
    streamId: 's',
    createdAt: 1700000000000,
    checkpointNamespace: 'ns',
    checkpointId: 'head',
  };
  const claim = { ...candidate, ownerToken: 'owner' };
  const identity = {
    streamId: 's',
    createdAt: candidate.createdAt,
    checkpointNamespace: 'ns',
    providerExecutionId: 'provider',
    recoveryOwnerToken: '',
    operationKey: 'a'.repeat(64),
    argumentsDigest: 'b'.repeat(64),
  };
  let reads = 0,
    checks = 0;
  const deps = {
    store: {
      readNativeMissionEffect: async () => {
        reads++;
        return {
          accepted: true,
          reason: 'committed',
          resultRef: 'private-ref',
          resultDigest: 'c'.repeat(64),
        };
      },
    },
    resolveExpectedEffects: async () => [{ identity }],
    verifyPrivateResult: async () => true,
    assertAuthorized: async () => {
      checks++;
    },
  };
  const verify = createNativeMissionReplayReceiptProof(deps);
  assert.equal(await verify({ candidate, claim }), true);
  assert.equal(reads, 1);
  assert.ok(checks >= 4);
  for (const receipt of [
    { accepted: false, reason: 'uncertain' },
    { accepted: true, reason: 'committed', resultRef: 'ref', resultDigest: 'wrong' },
  ]) {
    await assert.rejects(
      createNativeMissionReplayReceiptProof({
        ...deps,
        store: { readNativeMissionEffect: async () => receipt },
      })({ candidate, claim }),
      /EFFECT_UNCERTAIN/,
    );
  }
  await assert.rejects(
    createNativeMissionReplayReceiptProof({ ...deps, verifyPrivateResult: async () => false })({
      candidate,
      claim,
    }),
    /PRIVATE_RESULT_INVALID/,
  );
  await assert.rejects(
    createNativeMissionReplayReceiptProof({
      ...deps,
      resolveExpectedEffects: async () => [{ identity }, { identity }],
    })({ candidate, claim }),
    /IDENTITY_DENIED/,
  );
  await assert.rejects(
    verify({ candidate, claim: { ...claim, checkpointId: 'other' } }),
    /IDENTITY_DENIED/,
  );
  console.log('BOTMODE_NATIVE_MISSION_REPLAY_RECEIPTS_READBACK=PASS');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
