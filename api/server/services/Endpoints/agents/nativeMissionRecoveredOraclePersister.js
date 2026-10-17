/** Persist recovered Oracle evidence with the recovered provider's Redis owner CAS.
 * Generation-only writes are intentionally rejected after owner promotion.
 * This writer never grants publication or trusts an Oracle verdict supplied by
 * a model; normalizing the trusted host result is mandatory.
 */
function createNativeMissionRecoveredOraclePersister({
  store,
  candidate,
  claim,
  assertAuthorized,
  normalizeOracleState,
}) {
  if (
    typeof store?.getJob !== 'function' ||
    typeof store?.updateRecoveredMissionEvidence !== 'function' ||
    typeof assertAuthorized !== 'function' ||
    typeof normalizeOracleState !== 'function' ||
    !candidate ||
    !claim ||
    claim.streamId !== candidate.streamId ||
    claim.createdAt !== candidate.createdAt ||
    claim.checkpointId !== candidate.checkpointId ||
    claim.checkpointNamespace !== candidate.checkpointNamespace ||
    typeof claim.ownerToken !== 'string' ||
    !claim.ownerToken
  ) {
    throw new Error('NATIVE_RECOVERY_ORACLE_PERSISTER_DEPENDENCIES_MISSING');
  }

  let tail = Promise.resolve();
  const persist = async (result) => {
    await assertAuthorized();
    const before = await store.getJob(candidate.streamId);
    const task = before?.orchestratorPlan?.tasks?.find((item) => item.taskId === result?.taskId);
    if (
      before?.createdAt !== candidate.createdAt ||
      before?.status !== 'running' ||
      before?.checkpointNamespace !== candidate.checkpointNamespace ||
      before?.pendingAction != null ||
      before?.providerDrained !== false ||
      typeof before?.providerExecutionId !== 'string' ||
      !before.providerExecutionId ||
      before.providerExecutionStartedId !== before.providerExecutionId ||
      !task ||
      task.nodeId !== result?.nodeId ||
      !Array.isArray(task.validation) ||
      task.validation.length === 0 ||
      !Array.isArray(result.verdicts) ||
      result.verdicts.length !== task.validation.length
    ) {
      throw new Error('NATIVE_RECOVERY_ORACLE_PERSISTER_JOB_DENIED');
    }

    const current = normalizeOracleState(
      before.missionOracleState ?? { evidence: {}, results: {} },
    );
    const existing = current.results[result.taskId];
    if (existing != null && JSON.stringify(existing) !== JSON.stringify(result)) {
      throw new Error('NATIVE_RECOVERY_ORACLE_REPLAY_CONFLICT');
    }
    const nextState = normalizeOracleState({
      evidence: current.evidence,
      results: { ...current.results, [result.taskId]: existing ?? result },
    });
    await assertAuthorized();
    const updated = await store.updateRecoveredMissionEvidence(
      candidate.streamId,
      candidate.createdAt,
      claim.ownerToken,
      before.providerExecutionId,
      { missionOracleState: nextState },
    );
    if (updated !== true) {
      throw new Error('NATIVE_RECOVERY_ORACLE_OWNER_LOST');
    }
    await assertAuthorized();
    const saved = await store.getJob(candidate.streamId);
    if (
      saved?.createdAt !== candidate.createdAt ||
      saved?.status !== 'running' ||
      saved?.checkpointNamespace !== candidate.checkpointNamespace ||
      saved?.providerExecutionId !== before.providerExecutionId ||
      saved?.providerExecutionStartedId !== before.providerExecutionId ||
      saved?.providerDrained !== false ||
      JSON.stringify(saved.missionOracleState) !== JSON.stringify(nextState)
    ) {
      throw new Error('NATIVE_RECOVERY_ORACLE_READBACK_MISMATCH');
    }
    return nextState;
  };
  // Predecessor and terminal nodes may submit at the same time. Never lose a
  // sibling result through read/merge/write races on the shared Oracle state.
  return (result) => {
    const next = tail.catch(() => {}).then(() => persist(result));
    tail = next.catch(() => {});
    return next;
  };
}

module.exports = { createNativeMissionRecoveredOraclePersister };
