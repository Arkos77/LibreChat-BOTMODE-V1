/**
 * Qualifies Redis ownership for an already authorized, durable native mission.
 * This is a DIAGNOSTIC, not an automatic recovery handler.
 *
 * Two live host authorization checks surround the Redis claim; the exact
 * generation and checkpoint must remain unchanged. The claim is always
 * released with its unique owner token, including when reauthorization fails.
 * No graph, tool, model, or Oracle/publication action is ever executed here.
 */
function createNativeMissionRecoveryClaimProbe({ manager, authorizeCandidate, log }) {
  if (
    !manager ||
    typeof manager.claimCheckpointedOrphanForInspection !== 'function' ||
    typeof manager.getJobStore !== 'function' ||
    typeof authorizeCandidate !== 'function' ||
    typeof log?.info !== 'function' ||
    typeof log?.warn !== 'function'
  ) {
    throw new Error('Native mission claim diagnostic dependencies unavailable');
  }

  return async (candidate) => {
    const store = manager.getJobStore();
    if (
      typeof store?.getJob !== 'function' ||
      typeof store.releaseDrainedMissionRecovery !== 'function'
    ) {
      return false;
    }
    const isAuthorized = async () => {
      const job = await store.getJob(candidate.streamId);
      return (await authorizeCandidate({ candidate, job })) === true;
    };

    if (!(await isAuthorized())) return false;
    const claim = await manager.claimCheckpointedOrphanForInspection(
      candidate.streamId,
      candidate.createdAt,
    );
    if (claim == null) {
      log.info('[NativeMissionRecovery] Claim diagnostic outcome=NOT_CLAIMED');
      return false;
    }

    // A stale or mismatched claim must not be trusted or released as a
    // substitute owner. It still uses the returned token, never a random
    // release guessed from a mutable live job record.
    let safe = false;
    let released = false;
    try {
      const exact =
        claim.streamId === candidate.streamId &&
        claim.createdAt === candidate.createdAt &&
        claim.checkpointNamespace === candidate.checkpointNamespace &&
        claim.checkpointId === candidate.checkpointId &&
        typeof claim.ownerToken === 'string' &&
        claim.ownerToken.length > 0;
      if (exact && (await isAuthorized())) {
        safe = true;
      }
    } finally {
      if (typeof claim.ownerToken === 'string' && claim.ownerToken.length > 0) {
        released = await store.releaseDrainedMissionRecovery(
          candidate.streamId,
          candidate.createdAt,
          claim.ownerToken,
        );
      }
      log.info(
        '[NativeMissionRecovery] Claim diagnostic ' +
          JSON.stringify({
            qualified: safe,
            released,
          }),
      );
    }
    // Even a successful diagnosis grants no authority to execute a graph:
    // full resume still requires replay receipts and fresh owner fencing.
    return safe && released;
  };
}

module.exports = { createNativeMissionRecoveryClaimProbe };
