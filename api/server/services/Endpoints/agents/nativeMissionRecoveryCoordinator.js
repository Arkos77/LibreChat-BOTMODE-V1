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
  log,
}) {
  if (
    !manager ||
    typeof manager.claimCheckpointedOrphanForInspection !== 'function' ||
    typeof manager.getJobStore !== 'function' ||
    typeof authorizeCandidate !== 'function' ||
    typeof reconstruct !== 'function' ||
    typeof execute !== 'function' ||
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
        typeof runtime.continueGraph !== 'function' ||
        typeof runtime.verifyOracle !== 'function' ||
        typeof runtime.publishTerminal !== 'function' ||
        !runtime.graph ||
        typeof runtime.graph.getState !== 'function'
      )
        return false;
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
        continueGraph: runtime.continueGraph,
        verifyOracle: runtime.verifyOracle,
        publishTerminal: runtime.publishTerminal,
      });
      handedOff = outcome !== false;
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
