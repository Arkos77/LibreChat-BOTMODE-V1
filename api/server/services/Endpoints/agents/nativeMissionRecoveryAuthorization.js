/**
 * Resolve current host authority for a cold native-mission continuation.
 *
 * Read-only, fail-closed. The input MUST be raw Redis SerializableJobData
 * (flat durable fields), NOT GenerationJobManager.getJob()'s runtime facade.
 * A durable job is provenance, not a login session or
 * authorization. No synthetic req.user, access token, permission grant, Redis
 * claim, tool execution, or publication is created by this admission check.
 *
 * Injectable dependencies allow qualification without connecting to live
 * users, data, or providers.
 */
async function authorizeNativeMissionRecovery({
  candidate,
  job,
  deps,
  reportRejection,
  promotedOwnerProof,
}) {
  // Only allow-listed gate names are emitted; no durable identity or content.
  const deny = (gate) => {
    if (typeof reportRejection === 'function') reportRejection(gate);
    return null;
  };
  // The promoted-owner phase is NOT equivalent to the original provider's
  // preflight state. Accept it only with a Redis-server-time live-claim proof
  // validated by the host coordinator immediately before this read.
  // A caller-supplied boolean or job field is NEVER a proof of ownership.
  const promoted =
    promotedOwnerProof != null &&
    typeof promotedOwnerProof.ownerToken === 'string' &&
    promotedOwnerProof.ownerToken.length >= 16 &&
    promotedOwnerProof.streamId === candidate?.streamId &&
    promotedOwnerProof.createdAt === candidate?.createdAt &&
    promotedOwnerProof.checkpointNamespace === candidate?.checkpointNamespace &&
    promotedOwnerProof.providerExecutionId === job?.providerExecutionId &&
    typeof job?.providerExecutionId === 'string' &&
    job.providerExecutionId.length >= 16 &&
    (job.providerDrained === true ||
      (job.providerDrained === false &&
        job.providerExecutionStartedId === job.providerExecutionId));
  const phaseAllowed = promoted
    ? job?.status === 'running' ||
      (job?.status === 'complete' && job.terminalPersistencePending === true)
    : job?.status === 'running' &&
      job.providerDrained === false &&
      job.providerExecutionStartedId === job.providerExecutionId;
  if (
    !candidate ||
    typeof candidate.streamId !== 'string' ||
    candidate.streamId.length === 0 ||
    !Number.isSafeInteger(candidate.createdAt) ||
    candidate.createdAt <= 0 ||
    typeof candidate.checkpointNamespace !== 'string' ||
    candidate.checkpointNamespace.length === 0 ||
    typeof candidate.checkpointId !== 'string' ||
    candidate.checkpointId.length === 0 ||
    !job ||
    job.streamId !== candidate.streamId ||
    job.createdAt !== candidate.createdAt ||
    !phaseAllowed ||
    job.checkpointNamespace !== candidate.checkpointNamespace ||
    typeof job.providerExecutionId !== 'string' ||
    job.providerExecutionId.length === 0 ||
    job.pendingAction != null ||
    job.endpoint !== 'agents' ||
    typeof job.userId !== 'string' ||
    !job.userId ||
    typeof job.agent_id !== 'string' ||
    !job.agent_id ||
    !job.orchestratorPlan ||
    !Array.isArray(job.orchestratorPlan.tasks) ||
    job.orchestratorPlan.tasks.length === 0
  ) {
    return deny('job');
  }
  if (
    !deps ||
    typeof deps.getUserById !== 'function' ||
    typeof deps.getConvo !== 'function' ||
    typeof deps.getAgent !== 'function' ||
    typeof deps.canViewAgent !== 'function' ||
    typeof deps.isOwnerAdmissible !== 'function'
  ) {
    return deny('dependencies');
  }

  const userId = job.userId;
  const [user, active] = await Promise.all([
    deps.getUserById(userId),
    deps.isOwnerAdmissible(userId),
  ]);
  if (!user || !active || String(user._id ?? user.id ?? '') !== userId) return deny('owner');
  const tenantId = job.tenantId ?? undefined;
  if ((user.tenantId ?? undefined) !== tenantId) return deny('tenant');

  // getConvo(userId, id) is owner-scoped; never look up this conversation as
  // another user's session or trust serialized req/res fields from the job.
  const convo = await deps.getConvo(userId, candidate.streamId);
  if (
    !convo ||
    convo.conversationId !== candidate.streamId ||
    convo.agent_id !== job.agent_id ||
    (convo.tenantId ?? undefined) !== tenantId ||
    convo.subagentThread != null
  ) {
    return deny('conversation');
  }

  const agentIds = new Set([job.agent_id]);
  for (const task of job.orchestratorPlan.tasks) {
    if (
      !task ||
      typeof task.agentId !== 'string' ||
      task.agentId.length === 0 ||
      typeof task.key !== 'string' ||
      task.key.length === 0
    ) {
      return deny('plan');
    }
    agentIds.add(task.agentId);
  }
  // Every planned specialist is checked anew. An old Oracle verdict or
  // cached agent descriptor is not evidence of current VIEW permission.
  if (agentIds.size > 32) return deny('plan');
  for (const id of agentIds) {
    const agent = await deps.getAgent({ id });
    if (!agent || agent.id !== id || agent._id == null) return deny('agent');
    if (!(await deps.canViewAgent({ user, agent }))) return deny('permission');
  }

  // This is authority to *consider* reconstruction, not to replay a node:
  // independent durable receipts and Redis CAS must still approve that.
  return Object.freeze({
    userId,
    tenantId,
    conversationId: candidate.streamId,
    agentId: job.agent_id,
    checkpointNamespace: candidate.checkpointNamespace,
    checkpointId: candidate.checkpointId,
    ...(promoted && { promotedOwnerToken: promotedOwnerProof.ownerToken }),
    agentIds: Object.freeze([...agentIds]),
  });
}

module.exports = { authorizeNativeMissionRecovery };
