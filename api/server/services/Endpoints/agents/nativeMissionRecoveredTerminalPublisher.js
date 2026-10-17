/** Exact-owner terminal publication after the recovered segment's success CAS.
 * The private candidate/Oracle verdicts already live in Redis. No new model,
 * tool, grant or scheduler may run here. Mongo history is committed and read
 * back BEFORE a single Redis final-event CAS / SSE publication attempt.
 * On a crash/denial, terminalPersistencePending remains recoverable by the
 * existing conservative stale-terminal reconciler.
 */
function createNativeMissionRecoveredTerminalPublisher({
  store,
  candidate,
  claim,
  assertAuthorized,
  getConversation,
  getMessage,
  saveMessage,
  sanitizeMessage,
  emitDone,
}) {
  if (
    typeof store?.getJob !== 'function' ||
    typeof store?.finalizeRecoveredMissionTerminal !== 'function' ||
    [assertAuthorized, getConversation, getMessage, saveMessage, sanitizeMessage, emitDone].some(
      (callback) => typeof callback !== 'function',
    ) ||
    !candidate ||
    !claim ||
    claim.streamId !== candidate.streamId ||
    claim.createdAt !== candidate.createdAt ||
    claim.checkpointId !== candidate.checkpointId ||
    claim.checkpointNamespace !== candidate.checkpointNamespace ||
    typeof claim.ownerToken !== 'string' ||
    !claim.ownerToken
  ) {
    throw new Error('NATIVE_RECOVERY_TERMINAL_PUBLISHER_DEPENDENCIES_MISSING');
  }

  return async () => {
    await assertAuthorized();
    const job = await store.getJob(candidate.streamId);
    if (
      job?.createdAt !== candidate.createdAt ||
      job?.status !== 'complete' ||
      job?.terminalPersistencePending !== true ||
      job?.checkpointNamespace !== candidate.checkpointNamespace ||
      job?.endpoint !== 'agents' ||
      job?.pendingAction != null ||
      typeof job?.userId !== 'string' ||
      !job.userId ||
      typeof job?.responseMessageId !== 'string' ||
      !job.responseMessageId ||
      typeof job?.providerExecutionId !== 'string' ||
      !job.providerExecutionId ||
      job.providerExecutionStartedId !== job.providerExecutionId ||
      !Array.isArray(job?.missionCandidateContent) ||
      job.missionCandidateContent.length === 0 ||
      job.missionCandidateContent.some(
        (part) => part?.type !== 'text' || typeof part.text !== 'string',
      ) ||
      !Array.isArray(job?.missionCandidateAttachments) ||
      // No request-independent file authorization adapter for cold missions.
      job.missionCandidateAttachments.length !== 0 ||
      !job?.missionOracleState ||
      !Array.isArray(job?.orchestratorPlan?.tasks) ||
      job.orchestratorPlan.tasks.length === 0 ||
      !job.missionOracleState.results ||
      Object.keys(job.missionOracleState.results).length !== job.orchestratorPlan.tasks.length ||
      job.orchestratorPlan.tasks.some(
        (task) =>
          !task ||
          typeof task.taskId !== 'string' ||
          !task.taskId ||
          !Array.isArray(task.validation) ||
          task.validation.length === 0 ||
          job.missionOracleState.results?.[task.taskId]?.verdicts?.length !==
            task.validation.length ||
          job.missionOracleState.results[task.taskId].verdicts.some((v) => v.status !== 'VERIFIED'),
      ) ||
      typeof job?.userMessage?.messageId !== 'string' ||
      !job.userMessage.messageId
    ) {
      throw new Error('NATIVE_RECOVERY_TERMINAL_JOB_NOT_VERIFIED');
    }

    const [conversation, userMessage, existingResponse] = await Promise.all([
      getConversation(job.userId, candidate.streamId),
      getMessage({ user: job.userId, messageId: job.userMessage.messageId }),
      getMessage({ user: job.userId, messageId: job.responseMessageId }),
    ]);
    if (
      !conversation ||
      conversation.conversationId !== candidate.streamId ||
      conversation.agent_id !== job.agent_id ||
      (conversation.tenantId ?? undefined) !== (job.tenantId ?? undefined) ||
      !userMessage ||
      userMessage.messageId !== job.userMessage.messageId ||
      userMessage.conversationId !== candidate.streamId ||
      String(userMessage.user) !== job.userId ||
      userMessage.isCreatedByUser !== true ||
      (existingResponse != null &&
        (existingResponse.messageId !== job.responseMessageId ||
          existingResponse.conversationId !== candidate.streamId ||
          String(existingResponse.user) !== job.userId ||
          existingResponse.isCreatedByUser !== false))
    ) {
      throw new Error('NATIVE_RECOVERY_TERMINAL_HISTORY_NOT_AUTHORIZED');
    }
    await assertAuthorized();
    const savedResponse = await saveMessage(
      { userId: job.userId },
      {
        messageId: job.responseMessageId,
        conversationId: candidate.streamId,
        parentMessageId: job.userMessage.messageId,
        endpoint: 'agents',
        sender: job.sender ?? 'Agent',
        user: job.userId,
        isCreatedByUser: false,
        content: job.missionCandidateContent,
        attachments: job.missionCandidateAttachments,
        unfinished: false,
        contextMeta: null,
      },
      { context: 'native mission recovered terminal (owner-fenced)' },
    );
    await assertAuthorized();
    const response = await getMessage({ user: job.userId, messageId: job.responseMessageId });
    if (
      !savedResponse ||
      !response ||
      response.messageId !== job.responseMessageId ||
      response.conversationId !== candidate.streamId ||
      response.parentMessageId !== job.userMessage.messageId ||
      String(response.user) !== job.userId ||
      response.isCreatedByUser !== false ||
      response.unfinished === true ||
      JSON.stringify(response.content ?? []) !== JSON.stringify(job.missionCandidateContent) ||
      JSON.stringify(response.attachments ?? []) !== JSON.stringify(job.missionCandidateAttachments)
    ) {
      throw new Error('NATIVE_RECOVERY_TERMINAL_MESSAGE_READBACK_MISMATCH');
    }
    await assertAuthorized();
    const finalEvent = {
      final: true,
      conversation,
      requestMessage: sanitizeMessage(userMessage),
      responseMessage: sanitizeMessage(response),
    };
    if (!finalEvent.requestMessage || !finalEvent.responseMessage) {
      throw new Error('NATIVE_RECOVERY_TERMINAL_EVENT_INVALID');
    }
    const committed = await store.finalizeRecoveredMissionTerminal(
      candidate.streamId,
      candidate.createdAt,
      claim.ownerToken,
      job.providerExecutionId,
      candidate.checkpointNamespace,
      job.responseMessageId,
      JSON.stringify(finalEvent),
    );
    if (committed !== true) {
      throw new Error('NATIVE_RECOVERY_TERMINAL_OWNER_LOST');
    }
    // After the Redis final-event CAS, the exact frame is immutable. A lost
    // transport acknowledgment is not license to rewrite/re-publish it.
    await emitDone(candidate.streamId, finalEvent, candidate.createdAt);
  };
}

module.exports = { createNativeMissionRecoveredTerminalPublisher };
