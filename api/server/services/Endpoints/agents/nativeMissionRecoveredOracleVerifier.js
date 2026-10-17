/** Revalidate the completed cold graph against the ORIGINAL deterministic
 * mission plan and persist each task's Oracle verdict under the recovered
 * provider's live Redis owner. Nothing here produces model responses, grants
 * authority or stages user-visible content. Missing/contradictory output is
 * a refusal, never an inferred success.
 */
function createNativeMissionRecoveredOracleVerifier({
  store,
  client,
  graph,
  candidate,
  assertAuthorized,
  validateMissionTask,
  areMissionOracleResultsEquivalent,
  normalizeOracleState,
}) {
  if (
    typeof store?.getJob !== 'function' ||
    typeof graph?.getState !== 'function' ||
    typeof assertAuthorized !== 'function' ||
    typeof validateMissionTask !== 'function' ||
    typeof areMissionOracleResultsEquivalent !== 'function' ||
    typeof normalizeOracleState !== 'function' ||
    typeof client?.options?.nativeMissionRecoveredOraclePersister !== 'function' ||
    !candidate?.streamId ||
    !candidate.checkpointNamespace ||
    !client?.orchestratorPlan
  ) {
    throw new Error('NATIVE_RECOVERY_ORACLE_VERIFIER_DEPENDENCIES_MISSING');
  }
  return async () => {
    await assertAuthorized();
    const job = await store.getJob(candidate.streamId);
    const plan = job?.orchestratorPlan;
    if (
      job?.createdAt !== candidate.createdAt ||
      job?.status !== 'running' ||
      job?.checkpointNamespace !== candidate.checkpointNamespace ||
      job?.pendingAction != null ||
      job?.providerDrained !== false ||
      !job.providerExecutionId ||
      job.providerExecutionStartedId !== job.providerExecutionId ||
      !plan ||
      JSON.stringify(plan) !== JSON.stringify(client.orchestratorPlan) ||
      !Array.isArray(plan.tasks) ||
      plan.tasks.length === 0 ||
      new Set(plan.tasks.map((task) => task.taskId)).size !== plan.tasks.length ||
      plan.tasks.some(
        (task) =>
          !task?.taskId ||
          !task.nodeId ||
          !task.agentId ||
          !Array.isArray(task.validation) ||
          task.validation.length === 0,
      )
    ) {
      throw new Error('NATIVE_RECOVERY_ORACLE_VERIFIER_JOB_DENIED');
    }
    const config = {
      configurable: {
        thread_id: candidate.streamId,
        checkpoint_ns: '',
        __librechat_checkpoint_ns: candidate.checkpointNamespace,
        __librechat_mission_sync: true,
      },
    };
    const state = await graph.getState(config);
    if (
      !state ||
      !Array.isArray(state.next) ||
      state.next.length !== 0 ||
      !Array.isArray(state.tasks) ||
      state.tasks.length !== 0 ||
      !state.values ||
      !state.values.agentOutputs ||
      typeof state.values.agentOutputs !== 'object'
    ) {
      throw new Error('NATIVE_RECOVERY_ORACLE_GRAPH_NOT_TERMINAL');
    }
    let oracle = normalizeOracleState(job.missionOracleState ?? { evidence: {}, results: {} });
    for (const task of plan.tasks) {
      await assertAuthorized();
      const output = state.values.agentOutputs[task.nodeId];
      if (typeof output?.content !== 'string' || !output.content.trim()) {
        throw new Error('NATIVE_RECOVERY_ORACLE_OUTPUT_MISSING');
      }
      const verified = await validateMissionTask({
        taskId: task.taskId,
        nodeId: task.nodeId,
        agentId: task.agentId,
        candidate: output.content,
        requirements: task.validation,
        evidence: oracle.evidence[task.taskId] ?? [],
      });
      if (
        verified?.taskId !== task.taskId ||
        verified.nodeId !== task.nodeId ||
        !Array.isArray(verified.verdicts) ||
        verified.verdicts.length !== task.validation.length ||
        verified.verdicts.some((verdict) => verdict?.status !== 'VERIFIED')
      ) {
        throw new Error('NATIVE_RECOVERY_ORACLE_VERDICT_DENIED');
      }
      const previous = oracle.results[task.taskId];
      if (previous && !areMissionOracleResultsEquivalent(previous, verified)) {
        throw new Error('NATIVE_RECOVERY_ORACLE_REPLAY_CONFLICT');
      }
      oracle = await client.options.nativeMissionRecoveredOraclePersister(verified);
      oracle = normalizeOracleState(oracle);
    }
    await assertAuthorized();
    const saved = await store.getJob(candidate.streamId);
    if (
      saved?.createdAt !== candidate.createdAt ||
      saved?.status !== 'running' ||
      saved?.checkpointNamespace !== candidate.checkpointNamespace ||
      saved?.providerExecutionId !== job.providerExecutionId ||
      saved?.providerExecutionStartedId !== job.providerExecutionId ||
      saved?.providerDrained !== false
    ) {
      throw new Error('NATIVE_RECOVERY_ORACLE_FINAL_READBACK_DENIED');
    }
    const durable = normalizeOracleState(saved.missionOracleState);
    if (
      Object.keys(durable.results).length !== plan.tasks.length ||
      plan.tasks.some(
        (task) =>
          durable.results[task.taskId]?.nodeId !== task.nodeId ||
          durable.results[task.taskId]?.verdicts?.length !== task.validation.length ||
          durable.results[task.taskId].verdicts.some((verdict) => verdict?.status !== 'VERIFIED'),
      )
    ) {
      throw new Error('NATIVE_RECOVERY_ORACLE_FINAL_READBACK_DENIED');
    }
    client.missionOracleState = durable;
  };
}

module.exports = { createNativeMissionRecoveredOracleVerifier };
