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
      typeof store.releaseDrainedMissionRecovery !== 'function'
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
    let handedOff = false;
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
        typeof runtime.stageDurablePublication !== 'function' ||
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
      // Only the supplied executor may hand the claim to the owner-fenced
      // segment; it is responsible for Redis CAS and final publication.
      // A rejected qualification must not strand this exact Redis claim.
      // A thrown execution error may have already promoted the provider,
      // so only release on an explicit `false` (unpromoted) result.
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
        stageDurablePublication: (identity) =>
          runtime.stageDurablePublication({ identity, store, assertAuthorized: authorize }),
        publishTerminal: runtime.publishTerminal,
      });
      // Only an explicit boolean acknowledgement can complete the handoff.
      // An undefined return may mean the executor never activated its lease.
      if (outcome !== true && outcome !== false) {
        throw new Error('NATIVE_RECOVERY_HANDOFF_INDETERMINATE');
      }
      handedOff = outcome === true;
      return outcome;
    } finally {
      if (!handedOff) {
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
