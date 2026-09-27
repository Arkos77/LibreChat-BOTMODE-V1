const {
  createImprovementCandidate,
  createImprovementPayloadDigest,
  createMtoEvent,
} = require('@librechat/api');

function required(value, name) {
  if (typeof value !== 'string' || value.trim() === '')
    throw new Error(`Skill proposal requires ${name}`);
  return value.trim();
}

/** Captures a native child edit before mutation; review and publication are separate. */
async function recordSkillImprovementProposal({
  req,
  tenantId,
  conversationId,
  traceId,
  taskId,
  proposal,
  persistProposal,
  persistCandidate,
  mtoEventSink,
}) {
  const user = req?.user?._id ?? req?.user?.id;
  if (!user) throw new Error('Skill proposal requires authenticated owner');
  const nativeTaskId = required(taskId, 'native taskId');
  const normalizedTraceId = required(traceId, 'traceId');
  const toolCallId = required(proposal?.toolCallId, 'toolCallId');
  const normalizedConversationId = required(conversationId, 'conversationId');
  if (typeof persistProposal !== 'function' || typeof persistCandidate !== 'function') {
    throw new Error('Skill proposal durable stores are unavailable');
  }
  const candidateId = `skill:${nativeTaskId}:${toolCallId}`;
  const payloadDigest = createImprovementPayloadDigest(proposal.update);
  const saved = await persistProposal({
    user,
    tenantId,
    conversationId: normalizedConversationId,
    proposal: {
      candidateId,
      traceId: normalizedTraceId,
      taskId: nativeTaskId,
      toolCallId,
      skillId: required(proposal.skillId, 'skillId'),
      expectedVersion: proposal.expectedVersion,
      payloadDigest,
      diff: proposal.diff,
      update: proposal.update,
    },
  });
  const timestamp = new Date(saved.record.persistedAt).toISOString();
  const observation = createMtoEvent(
    'OBSERVED',
    {
      traceId: normalizedTraceId,
      traceEventId: `skill-proposal:${candidateId}`,
      taskId: nativeTaskId,
      timestamp,
    },
    'host',
    { payloadDigest },
  );
  const candidate = createImprovementCandidate({
    candidateId,
    target: 'skill',
    title: 'Review proposed skill update',
    summary: 'A native child proposed a skill edit for independent tests and exact diff review.',
    traceId: normalizedTraceId,
    observations: [observation],
    payloadDigest,
    requiresHumanReview: true,
    createdAt: timestamp,
  });
  await persistCandidate({ user, tenantId, conversationId: normalizedConversationId, candidate });
  if (typeof mtoEventSink === 'function') {
    try {
      await mtoEventSink(
        createMtoEvent(
          'CANDIDATE',
          {
            traceId: normalizedTraceId,
            traceEventId: `candidate:${candidateId}`,
            causedByTraceEventId: observation.identity.traceEventId,
            taskId: nativeTaskId,
            timestamp,
          },
          'host',
          { payloadDigest },
        ),
      );
    } catch (_) {
      // Auxiliary MTO failure cannot roll back the durable proposal and candidate.
    }
  }
  return { candidateId };
}
module.exports = { recordSkillImprovementProposal };
