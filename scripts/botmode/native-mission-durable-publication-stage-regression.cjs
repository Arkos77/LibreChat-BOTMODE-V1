'use strict';
const assert = require('node:assert/strict');
const {
  createNativeMissionDurablePublicationStage,
} = require('../../api/server/services/Endpoints/agents/nativeMissionDurablePublicationStage');
(async () => {
  const identity = {
    streamId: 'mission',
    createdAt: 1700000000000,
    ownerToken: 'owner-123456789123456',
    providerExecutionId: 'provider-123456789',
    checkpointNamespace: 'ns',
  };
  const candidate = {
    content: [{ type: 'text', text: 'approved' }],
    attachments: [],
    oracle: { status: 'accepted' },
  };
  let job;
  const store = {
    updateRecoveredMissionEvidence: async (...args) => {
      assert.deepEqual(args.slice(0, 4), [
        identity.streamId,
        identity.createdAt,
        identity.ownerToken,
        identity.providerExecutionId,
      ]);
      job = {
        ...args[4],
        createdAt: identity.createdAt,
        checkpointNamespace: identity.checkpointNamespace,
        status: 'running',
        providerExecutionId: identity.providerExecutionId,
      };
      return true;
    },
    getJob: async () => job,
  };
  await createNativeMissionDurablePublicationStage({
    store,
    identity,
    getCandidate: async () => candidate,
  })();
  await assert.rejects(
    createNativeMissionDurablePublicationStage({
      store: { ...store, updateRecoveredMissionEvidence: async () => false },
      identity,
      getCandidate: async () => candidate,
    })(),
    /OWNER_LOST/,
  );
  await assert.rejects(
    createNativeMissionDurablePublicationStage({
      store: { ...store, getJob: async () => ({ ...job, createdAt: identity.createdAt + 1 }) },
      identity,
      getCandidate: async () => candidate,
    })(),
    /NOT_VERIFIED/,
  );
  await assert.rejects(
    createNativeMissionDurablePublicationStage({
      store,
      identity,
      getCandidate: async () => ({ content: [] }),
    })(),
    /UNAVAILABLE/,
  );
  console.log('BOTMODE_DURABLE_PUBLICATION_STAGING_OWNER_AND_READBACK=PASS');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
