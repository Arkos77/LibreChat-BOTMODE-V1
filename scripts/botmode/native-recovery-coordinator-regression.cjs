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
    uncertainExecution = false,
    executionThrows = false,
    invalidPlan = false,
    exerciseStage = false,
    slowReconstructionMs = 0,
    failRenewal = false,
  } = {}) {
    const calls = [];
    let attempts = 0;
    let renewals = 0;
    let hostSignal;
    let persistedEvidence = { providerExecutionId: 'recovered-provider' };
    const store = {
      updateRecoveredMissionEvidence: async (id, createdAt, owner, provider, updates) => {
        assert.equal(id, candidate.streamId);
        assert.equal(owner, claim.ownerToken);
        assert.equal(provider, 'recovered-provider');
        persistedEvidence = { ...updates, providerExecutionId: provider };
        calls.push('stage-write');
        return true;
      },
      getJob: async () => ({
        ...persistedEvidence,
        status: 'running',
        createdAt: candidate.createdAt,
        checkpointNamespace: candidate.checkpointNamespace,
        missionOracleState: exerciseStage
          ? {
              evidence: {},
              results: {
                'mission/task-worker': {
                  taskId: 'mission/task-worker',
                  nodeId: 'worker',
                  verdicts: [{ status: 'VERIFIED' }],
                },
              },
            }
          : undefined,
        orchestratorPlan: {
          tasks: invalidPlan
            ? [{ nodeId: 'worker', agentId: '' }]
            : [
                {
                  nodeId: 'worker',
                  agentId: 'worker',
                  key: 'task-worker',
                  taskId: 'mission/task-worker',
                  validation: [{}],
                },
              ],
        },
      }),
      renewDrainedMissionRecovery: async (_stream, _created, token, leaseMs) => {
        assert.equal(token, claim.ownerToken);
        assert.equal(leaseMs, 15_000);
        renewals++;
        return !failRenewal;
      },
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
      reconstruct: async ({ signal }) => {
        hostSignal = signal;
        assert.equal(signal.aborted, false);
        calls.push('reconstruct');
        if (reconstructFails) throw Error('reconstruction failed');
        if (slowReconstructionMs)
          await new Promise((resolve) => setTimeout(resolve, slowReconstructionMs));
        return {
          graph: { getState: async () => ({}) },
          assertReplaySafe: async () => {},
          assertEffectFencesReady: async () => {
            calls.push('fences');
            if (missingFence) throw Error('no fences');
          },
          verifyOracle: async () => {},
          getPublicationCandidate: async () => ({
            content: [],
            attachments: [],
            oracle: {
              evidence: {},
              results: {
                'mission/task-worker': {
                  taskId: 'mission/task-worker',
                  nodeId: 'worker',
                  verdicts: [{ status: 'VERIFIED' }],
                },
              },
            },
          }),
          publishTerminal: async () => {},
        };
      },
      continueColdGraph: async (options) => {
        assert.equal(options.expectedCheckpointId, claim.checkpointId);
        assert.equal(options.streamId, claim.streamId);
        assert.deepEqual(options.plannedNodeIds, ['worker']);
        calls.push('continuation');
      },
      execute: async (args) => {
        calls.push('execute');
        assert.equal(args.claim.ownerToken, claim.ownerToken);
        await args.continueGraph(new AbortController().signal);
        if (exerciseStage)
          await args.stageDurablePublication({
            ...claim,
            providerExecutionId: 'recovered-provider',
          });
        if (executionThrows) throw new Error('provider died after activation');
        // The SDK owns release when it explicitly refuses activation.
        if (refusesExecution) {
          await store.releaseDrainedMissionRecovery(
            claim.streamId,
            claim.createdAt,
            claim.ownerToken,
          );
        }
        return uncertainExecution ? undefined : !refusesExecution;
      },
      log: { warn: () => {} },
    });
    let outcome, error;
    try {
      outcome = await coordinator(candidate);
    } catch (e) {
      error = e;
    }
    return { calls, outcome, error, renewals, hostSignal };
  }
  const staged = await verify({ exerciseStage: true });
  assert.equal(staged.outcome, true);
  assert.equal(staged.hostSignal.aborted, true);
  assert.ok(staged.calls.includes('stage-write'));
  assert.equal(staged.calls.filter((event) => event === 'release').length, 0);
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
    'continuation',
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
  const invalid = await verify({ invalidPlan: true });
  assert.equal(invalid.outcome, false);
  assert.equal(invalid.calls.filter((x) => x === 'release').length, 1);
  assert.ok(!invalid.calls.includes('execute'));
  const refused = await verify({ refusesExecution: true });
  assert.equal(refused.outcome, false);
  assert.equal(refused.calls.filter((x) => x === 'release').length, 1);
  const uncertain = await verify({ uncertainExecution: true });
  assert.match(uncertain.error.message, /INDETERMINATE/);
  assert.equal(uncertain.calls.filter((x) => x === 'release').length, 0);
  const thrown = await verify({ executionThrows: true });
  assert.match(thrown.error.message, /provider died after activation/);
  assert.equal(thrown.hostSignal.aborted, true);
  assert.equal(thrown.calls.filter((x) => x === 'release').length, 0);
  const longRebuild = await verify({ slowReconstructionMs: 4_300 });
  assert.equal(longRebuild.outcome, true);
  assert.ok(longRebuild.renewals >= 2, 'periodic heartbeat and handoff renewal required');
  const lostLease = await verify({ failRenewal: true });
  assert.match(lostLease.error.message, /INSPECTION_LEASE_LOST/);
  assert.equal(lostLease.calls.filter((event) => event === 'release').length, 1);
  assert.ok(!lostLease.calls.includes('execute'));
  const before = await verify({ denyAt: 1 });
  assert.deepEqual(before.calls, ['auth']);
  console.log('BOTMODE_SERVER_RECOVERY_COORDINATOR_AUTH_AND_RELEASE=PASS');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
