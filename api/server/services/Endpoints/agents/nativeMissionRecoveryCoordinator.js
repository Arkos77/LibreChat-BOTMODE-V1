const {
  createNativeMissionDurablePublicationStage,
} = require('./nativeMissionDurablePublicationStage');

const INSPECTION_CLAIM_LEASE_MS = 15_000;
const INSPECTION_CLAIM_HEARTBEAT_MS = 4_000;

/**
 * Host-side admission boundary for recovered native missions.
 * All execution callbacks must originate from the real authenticated host
 * reconstruction; this module never manufactures a user or a session.
 * No production registration is permitted until graph/tools/Oracle callbacks
 * are bound to the original durable mission, including private tool receipts.
 */
function createNativeMissionRecoveryCoordinator({
  manager,
  authorizeCandidate,
  reconstruct,
  execute,
  continueColdGraph,
  log,
}) {
  if (
    !manager ||
    typeof manager.claimCheckpointedOrphanForInspection !== 'function' ||
    typeof manager.getJobStore !== 'function' ||
    typeof authorizeCandidate !== 'function' ||
    typeof reconstruct !== 'function' ||
    typeof execute !== 'function' ||
    typeof continueColdGraph !== 'function' ||
    typeof log?.warn !== 'function'
  ) {
    throw new Error('Native recovery coordinator missing secure host dependencies');
  }
  return async (candidate) => {
    const store = manager.getJobStore();
    if (
      typeof store?.getJob !== 'function' ||
      typeof store.releaseDrainedMissionRecovery !== 'function' ||
      typeof store.renewDrainedMissionRecovery !== 'function'
    ) {
      return false;
    }
    const authorize = async () => {
      if (
        manager.getJobStore() !== store ||
        (await authorizeCandidate({ candidate, job: await store.getJob(candidate.streamId) })) !==
          true
      ) {
        throw new Error('NATIVE_RECOVERY_HOST_AUTHORITY_DENIED');
      }
    };
    await authorize();
    const claim = await manager.claimCheckpointedOrphanForInspection(
      candidate.streamId,
      candidate.createdAt,
    );
    if (!claim) return false;
    // Once the executor starts, it or the manager owns the promotion decision.
    // An exception can occur after promotion; never release that lease from
    // the coordinator's preflight cleanup path.
    let executorEntered = false;
    let renewalFailure = null;
    let renewalInFlight = null;
    const renewClaim = async () => {
      if (renewalFailure) throw renewalFailure;
      if (renewalInFlight) return renewalInFlight;
      const attempt = (async () => {
        try {
          if (
            manager.getJobStore() !== store ||
            !(await store.renewDrainedMissionRecovery(
              claim.streamId,
              claim.createdAt,
              claim.ownerToken,
              INSPECTION_CLAIM_LEASE_MS,
            ))
          ) {
            throw new Error('NATIVE_RECOVERY_HOST_INSPECTION_LEASE_LOST');
          }
        } catch (error) {
          renewalFailure = error;
          throw error;
        }
      })();
      renewalInFlight = attempt;
      void attempt
        .finally(() => {
          if (renewalInFlight === attempt) renewalInFlight = null;
        })
        .catch(() => {});
      return attempt;
    };
    // The model/agent host can take longer than the original 15-second
    // admission TTL. Keep the exact owner alive only during safe preflight.
    // Stop this timer BEFORE the SDK takes over provider ownership.
    const heartbeat = setInterval(() => {
      void renewClaim().catch(() => {});
    }, INSPECTION_CLAIM_HEARTBEAT_MS);
    try {
      if (
        claim.streamId !== candidate.streamId ||
        claim.createdAt !== candidate.createdAt ||
        claim.checkpointNamespace !== candidate.checkpointNamespace ||
        claim.checkpointId !== candidate.checkpointId ||
        typeof claim.ownerToken !== 'string' ||
        !claim.ownerToken
      )
        return false;
      await authorize();
      const runtime = await reconstruct({ candidate, claim, assertAuthorized: authorize });
      if (
        !runtime ||
        typeof runtime.assertReplaySafe !== 'function' ||
        typeof runtime.assertEffectFencesReady !== 'function' ||
        typeof runtime.verifyOracle !== 'function' ||
        typeof runtime.getPublicationCandidate !== 'function' ||
        typeof runtime.publishTerminal !== 'function' ||
        !runtime.graph ||
        typeof runtime.graph.getState !== 'function'
      )
        return false;
      const persistedJob = await store.getJob(candidate.streamId);
      const plan = persistedJob?.orchestratorPlan?.tasks;
      if (
        persistedJob?.createdAt !== candidate.createdAt ||
        persistedJob?.status !== 'running' ||
        persistedJob?.pendingAction != null ||
        persistedJob?.checkpointNamespace !== candidate.checkpointNamespace ||
        !Array.isArray(plan) ||
        plan.length === 0 ||
        plan.some(
          (task) =>
            !task ||
            typeof task.nodeId !== 'string' ||
            !task.nodeId ||
            typeof task.agentId !== 'string' ||
            !task.agentId ||
            typeof task.key !== 'string' ||
            !task.key,
        ) ||
        new Set(plan.map((task) => task.nodeId)).size !== plan.length
      )
        return false;
      const plannedNodeIds = plan.map((task) => task.nodeId);
      await runtime.assertEffectFencesReady();
      await authorize();
      // Check the lease again at the handoff boundary after ALL potentially
      // slow client/model reconstruction and receipt IO. The SDK independently
      // checks owner identity before activating the recovered provider.
      await renewClaim();
      clearInterval(heartbeat);
      // Only the supplied executor may hand the claim to the owner-fenced
      // segment; it is responsible for Redis CAS and final publication.
      // The SDK manager releases qualification refusals before promotion.
      // Once execution begins, this coordinator must never release a claim:
      // a throw or indeterminate result may have followed provider promotion.
      executorEntered = true;
      const outcome = await execute({
        manager,
        claim,
        graph: runtime.graph,
        assertAuthorized: authorize,
        assertReplaySafeForPendingNodes: runtime.assertReplaySafe,
        assertEffectFencesReady: runtime.assertEffectFencesReady,
        continueGraph: (signal) =>
          continueColdGraph({
            graph: runtime.graph,
            streamId: candidate.streamId,
            checkpointNamespace: candidate.checkpointNamespace,
            expectedCheckpointId: candidate.checkpointId,
            plannedNodeIds,
            signal,
          }),
        verifyOracle: runtime.verifyOracle,
        stageDurablePublication: async (identity) => {
          await authorize();
          await createNativeMissionDurablePublicationStage({
            store,
            identity,
            getCandidate: runtime.getPublicationCandidate,
          })();
          await authorize();
        },
        publishTerminal: runtime.publishTerminal,
      });
      // Only an explicit boolean acknowledgement can complete the handoff.
      // An undefined return may mean the executor never activated its lease.
      if (outcome !== true && outcome !== false) {
        throw new Error('NATIVE_RECOVERY_HANDOFF_INDETERMINATE');
      }
      return outcome;
    } finally {
      clearInterval(heartbeat);
      if (renewalInFlight) {
        await renewalInFlight.catch(() => {});
      }
      if (!executorEntered) {
        try {
          await store.releaseDrainedMissionRecovery(
            claim.streamId,
            claim.createdAt,
            claim.ownerToken,
          );
        } catch (error) {
          log.warn('[NativeMissionRecovery] Failed to release pre-execution claim', error);
        }
      }
    }
  };
}
module.exports = { createNativeMissionRecoveryCoordinator };
