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
  const claim = { ...candidate, ownerToken: 'mission-owner-recovered-123456789' };
  const recoveredProvider = 'recovered-provider-123456789';
  let phase = 'original';
  let revoked = false;
  let leaseValid = true;
  let proofChecks = 0;
  let authorizationCalls = 0;
  const plan = {
    tasks: [
      {
        key: 'worker',
        taskId: 'mission/worker',
        nodeId: 'p6_worker',
        agentId: 'worker',
        validation: [{}],
      },
    ],
  };
  const store = {
    getJob: async () => ({
      ...candidate,
      status: phase === 'terminal' ? 'complete' : 'running',
      terminalPersistencePending: phase === 'terminal',
      providerDrained: phase === 'original' ? false : phase === 'promoted',
      providerExecutionId: phase === 'original' ? 'original-provider' : recoveredProvider,
      providerExecutionStartedId:
        phase === 'original' || phase === 'promoted' ? 'original-provider' : recoveredProvider,
      orchestratorPlan: plan,
    }),
    inspectLiveRecoveredMissionOwner: async (thread, epoch, owner, provider, namespace) => {
      assert.deepEqual(
        [thread, epoch, owner, namespace],
        [candidate.streamId, candidate.createdAt, claim.ownerToken, candidate.checkpointNamespace],
      );
      proofChecks++;
      return leaseValid && phase !== 'original' && provider === recoveredProvider;
    },
    renewDrainedMissionRecovery: async () => true,
    releaseDrainedMissionRecovery: async () => true,
  };
  const manager = {
    getJobStore: () => store,
    claimCheckpointedOrphanForInspection: async () => claim,
  };
  const coordinator = createNativeMissionRecoveryCoordinator({
    manager,
    authorizeCandidate: async ({ job, promotedOwnerProof }) => {
      authorizationCalls++;
      if (revoked) return false;
      if (phase === 'original') {
        return (
          !promotedOwnerProof &&
          job.providerDrained === false &&
          job.providerExecutionStartedId === job.providerExecutionId
        );
      }
      return (
        promotedOwnerProof?.ownerToken === claim.ownerToken &&
        promotedOwnerProof?.providerExecutionId === recoveredProvider &&
        promotedOwnerProof?.checkpointNamespace === candidate.checkpointNamespace
      );
    },
    reconstruct: async () => ({
      graph: { getState: async () => ({}) },
      assertReplaySafe: async () => {},
      assertEffectFencesReady: async () => {},
      verifyOracle: async () => {},
      getPublicationCandidate: async () => ({ content: [], attachments: [], oracle: {} }),
      publishTerminal: async () => {},
    }),
    continueColdGraph: async () => {},
    execute: async (args) => {
      phase = 'promoted';
      await args.assertAuthorized();
      phase = 'active';
      await args.assertAuthorized();
      phase = 'terminal';
      await args.assertAuthorized();
      return true;
    },
    log: { warn: () => {} },
  });
  assert.equal(await coordinator(candidate), true);
  assert.ok(proofChecks >= 3);
  assert.ok(authorizationCalls >= 6);
  console.log('BOTMODE_COORDINATOR_PROMOTED_ACTIVE_TERMINAL_PROOF=PASS');

  phase = 'original';
  leaseValid = true;
  const stopped = createNativeMissionRecoveryCoordinator({
    manager,
    // Deliberately naive original-provider authorization: once the owner
    // lease expires, a started recovered provider resembles an ordinary one.
    // The coordinator must NOT use that fallback after a known promotion.
    authorizeCandidate: async ({ job, promotedOwnerProof }) =>
      promotedOwnerProof?.ownerToken === claim.ownerToken ||
      (job.status === 'running' &&
        job.providerDrained === false &&
        job.providerExecutionStartedId === job.providerExecutionId),
    reconstruct: async () => ({
      graph: { getState: async () => ({}) },
      assertReplaySafe: async () => {},
      assertEffectFencesReady: async () => {},
      verifyOracle: async () => {},
      getPublicationCandidate: async () => ({}),
      publishTerminal: async () => {},
    }),
    continueColdGraph: async () => {},
    execute: async (args) => {
      phase = 'promoted';
      await args.assertAuthorized();
      phase = 'active';
      leaseValid = false;
      await assert.rejects(args.assertAuthorized(), /HOST_PROMOTED_LEASE_LOST/);
      return false;
    },
    log: { warn: () => {} },
  });
  assert.equal(await stopped(candidate), false);
  console.log('BOTMODE_COORDINATOR_EXPIRED_PROMOTED_OWNER_DENIED=PASS');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
