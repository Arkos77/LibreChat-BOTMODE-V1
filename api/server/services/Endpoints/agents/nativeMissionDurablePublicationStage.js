/** Durable private candidate staging for recovered Oracle-approved missions.
 * This is not a publication barrier or permission to emit a visible message.
 * The original generation/owner/provider must be supplied by the fenced host.
 */
function createNativeMissionDurablePublicationStage({ store, identity, getCandidate }) {
  if (
    !store ||
    typeof store.updateRecoveredMissionEvidence !== 'function' ||
    typeof store.getJob !== 'function' ||
    typeof getCandidate !== 'function' ||
    !identity ||
    !identity.streamId ||
    !identity.checkpointNamespace ||
    !identity.ownerToken ||
    !identity.providerExecutionId ||
    !Number.isSafeInteger(identity.createdAt) ||
    identity.createdAt <= 0
  ) {
    throw new Error('NATIVE_RECOVERY_PUBLICATION_STAGE_DEPENDENCIES');
  }
  return async () => {
    const candidate = await getCandidate();
    if (
      !candidate ||
      !Array.isArray(candidate.content) ||
      !Array.isArray(candidate.attachments) ||
      !candidate.oracle ||
      typeof candidate.oracle !== 'object'
    ) {
      throw new Error('NATIVE_RECOVERY_PUBLICATION_CANDIDATE_UNAVAILABLE');
    }
    // A generic object is not an Oracle verdict. Every planned task must
    // have durable VERIFIED verdicts before staging a publishable candidate.
    const before = await store.getJob(identity.streamId);
    const tasks = before?.orchestratorPlan?.tasks;
    const results = candidate.oracle.results;
    if (
      before?.createdAt !== identity.createdAt ||
      before?.status !== 'running' ||
      before?.checkpointNamespace !== identity.checkpointNamespace ||
      !Array.isArray(tasks) ||
      tasks.length === 0 ||
      !results ||
      typeof results !== 'object' ||
      Array.isArray(results) ||
      // The Oracle persister has already committed each verdict under the
      // recovered provider's owner CAS. A publication callback must not be
      // able to replace those durable verdicts with newly synthesized ones.
      !before?.missionOracleState ||
      JSON.stringify(before.missionOracleState) !== JSON.stringify(candidate.oracle) ||
      // PlannedTask.taskId is the durable Oracle identity, NOT the short
      // objective key. The planner derives e.g. mission/worker and
      // mission/specialist; Oracle stores results under those full IDs.
      new Set(tasks.map((task) => task?.taskId)).size !== tasks.length ||
      Object.keys(results).length !== tasks.length ||
      tasks.some(
        (task) =>
          !task ||
          typeof task.taskId !== 'string' ||
          !task.taskId ||
          typeof task.nodeId !== 'string' ||
          !task.nodeId ||
          !Object.hasOwn(results, task.taskId) ||
          !Array.isArray(results[task.taskId]?.verdicts) ||
          !Array.isArray(task.validation) ||
          task.validation.length === 0 ||
          results[task.taskId].verdicts.length !== task.validation.length ||
          results[task.taskId].taskId !== task.taskId ||
          results[task.taskId].nodeId !== task.nodeId ||
          results[task.taskId].verdicts.some((verdict) => verdict?.status !== 'VERIFIED'),
      )
    ) {
      throw new Error('NATIVE_RECOVERY_PUBLICATION_ORACLE_UNVERIFIED');
    }
    const updates = {
      missionCandidateContent: candidate.content,
      missionCandidateAttachments: candidate.attachments,
      missionOracleState: candidate.oracle,
    };
    const saved = await store.updateRecoveredMissionEvidence(
      identity.streamId,
      identity.createdAt,
      identity.ownerToken,
      identity.providerExecutionId,
      updates,
    );
    if (saved !== true) throw new Error('NATIVE_RECOVERY_PUBLICATION_STAGE_OWNER_LOST');
    const job = await store.getJob(identity.streamId);
    if (
      job?.createdAt !== identity.createdAt ||
      job?.checkpointNamespace !== identity.checkpointNamespace ||
      job?.status !== 'running' ||
      job?.providerExecutionId !== identity.providerExecutionId ||
      JSON.stringify(job.missionCandidateContent) !==
        JSON.stringify(updates.missionCandidateContent) ||
      JSON.stringify(job.missionCandidateAttachments) !==
        JSON.stringify(updates.missionCandidateAttachments) ||
      JSON.stringify(job.missionOracleState) !== JSON.stringify(updates.missionOracleState)
    ) {
      throw new Error('NATIVE_RECOVERY_PUBLICATION_STAGE_NOT_VERIFIED');
    }
  };
}
module.exports = { createNativeMissionDurablePublicationStage };
