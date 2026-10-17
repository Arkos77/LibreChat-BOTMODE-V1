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
