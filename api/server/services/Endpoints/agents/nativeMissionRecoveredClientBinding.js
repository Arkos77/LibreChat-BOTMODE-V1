/** Bind an ALREADY initialized, authorized host AgentClient to an existing
 * durable mission. This does not create a request, identity or runnable graph.
 * The caller must first reconstruct the normal tools/agent configuration and
 * independently fence every effect before cold continuation is enabled.
 */
function bindNativeMissionRecoveredClient({ client, candidate, job, normalizeOracleState }) {
  if (
    !client ||
    !client.options?.req?.user ||
    !candidate ||
    !job ||
    typeof normalizeOracleState !== 'function' ||
    !Number.isSafeInteger(candidate.createdAt) ||
    candidate.createdAt <= 0 ||
    !candidate.streamId ||
    !candidate.checkpointNamespace ||
    !candidate.checkpointId ||
    job.streamId !== candidate.streamId ||
    job.createdAt !== candidate.createdAt ||
    job.checkpointNamespace !== candidate.checkpointNamespace ||
    job.status !== 'running' ||
    job.pendingAction != null ||
    typeof job.responseMessageId !== 'string' ||
    !job.responseMessageId ||
    typeof job.userMessage?.messageId !== 'string' ||
    !job.userMessage.messageId ||
    typeof job.agent_id !== 'string' ||
    !job.agent_id ||
    !job.orchestratorPlan ||
    !Array.isArray(job.orchestratorPlan.tasks) ||
    !job.orchestratorPlan.tasks.length ||
    String(client.options.req.user.id ?? client.options.req.user._id) !== job.userId ||
    client.options.req.body?.conversationId !== candidate.streamId ||
    client.conversationId !== candidate.streamId ||
    client.options.agent?.id !== job.agent_id ||
    (client.responseMessageId != null && client.responseMessageId !== job.responseMessageId) ||
    (client.parentMessageId != null && client.parentMessageId !== job.userMessage.messageId) ||
    typeof client.publicationBarrier?.activate !== 'function'
  ) {
    throw new Error('NATIVE_MISSION_COLD_CLIENT_BINDING_DENIED');
  }
  const state =
    job.missionOracleState == null ? undefined : normalizeOracleState(job.missionOracleState);
  client.jobCreatedAt = candidate.createdAt;
  client.checkpointNamespace = candidate.checkpointNamespace;
  client.orchestratorPlan = job.orchestratorPlan;
  client.missionOracleState = state;
  client.responseMessageId = job.responseMessageId;
  client.parentMessageId = job.userMessage?.messageId;
  client.publicationBarrier.activate();
  return client;
}
module.exports = { bindNativeMissionRecoveredClient };
