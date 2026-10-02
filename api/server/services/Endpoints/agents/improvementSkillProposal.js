const {
  getHostSkillTestsForSkill,
  getHostSkillTestsForCreate,
} = require('./improvementSkillTestPlan');
const { validateSkillImprovementCandidate } = require('./improvementSkillValidation');
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
  producerAgentId,
  proposal,
  persistProposal,
  persistCandidate,
  persistLifecycleEvent,
  getHostTests = getHostSkillTestsForSkill,
  getHostCreateTests = getHostSkillTestsForCreate,
  mtoEventSink,
}) {
  const user = req?.user?._id ?? req?.user?.id;
  if (!user) throw new Error('Skill proposal requires authenticated owner');
  const nativeTaskId = required(taskId, 'native taskId');
  const nativeProducer = required(producerAgentId, 'native producerAgentId');
  const normalizedTraceId = required(traceId, 'traceId');
  const toolCallId = required(proposal?.toolCallId, 'toolCallId');
  const normalizedConversationId = required(conversationId, 'conversationId');
  if (typeof persistProposal !== 'function' || typeof persistCandidate !== 'function') {
    throw new Error('Skill proposal durable stores are unavailable');
  }
  const candidateId = `skill:${nativeTaskId}:${toolCallId}`;
  if (typeof proposal.diff !== 'string' || proposal.diff.trim() === '') {
    throw new Error('Skill proposal requires an exact reviewable diff');
  }
  const operation = proposal.operation === 'create' ? 'create' : 'update';
  const payload = operation === 'create' ? proposal.create : proposal.update;
  const payloadDigest = createImprovementPayloadDigest(payload);
  const persistedProposal =
    operation === 'create'
      ? {
          candidateId,
          traceId: normalizedTraceId,
          taskId: nativeTaskId,
          producerAgentId: nativeProducer,
          toolCallId,
          operation: 'create',
          payloadDigest,
          diff: proposal.diff,
          create: proposal.create,
        }
      : {
          candidateId,
          traceId: normalizedTraceId,
          taskId: nativeTaskId,
          producerAgentId: nativeProducer,
          toolCallId,
          operation: 'update',
          skillId: required(proposal.skillId, 'skillId'),
          expectedVersion: proposal.expectedVersion,
          payloadDigest,
          diff: proposal.diff,
          update: proposal.update,
        };
  const saved = await persistProposal({
    user,
    tenantId,
    conversationId: normalizedConversationId,
    proposal: persistedProposal,
  });
  // The durable store may have coalesced this tool call into an earlier exact edit.
  const canonicalCandidateId = saved.record.proposal.candidateId;
  const timestamp = new Date(saved.record.persistedAt).toISOString();
  const observation = createMtoEvent(
    'OBSERVED',
    {
      traceId: normalizedTraceId,
      traceEventId: `skill-proposal:${canonicalCandidateId}`,
      taskId: nativeTaskId,
      agentId: nativeProducer,
      timestamp,
    },
    'host',
    { payloadDigest },
  );
  const candidate = createImprovementCandidate({
    candidateId: canonicalCandidateId,
    target: 'skill',
    title:
      operation === 'create' ? 'Review proposed skill creation' : 'Review proposed skill update',
    summary:
      operation === 'create'
        ? 'A native child proposed a new skill for exact diff review.'
        : 'A native child proposed a skill edit for independent tests and exact diff review.',
    traceId: normalizedTraceId,
    observations: [observation],
    payloadDigest,
    requiresHumanReview: true,
    createdAt: timestamp,
  });
  await persistCandidate({ user, tenantId, conversationId: normalizedConversationId, candidate });
  const tests =
    saved.record.proposal.operation === 'create'
      ? getHostCreateTests(saved.record.proposal.create.name)
      : getHostTests(saved.record.proposal.skillId);
  if (tests !== undefined) {
    await validateSkillImprovementCandidate({
      candidate,
      proposal: saved.record.proposal,
      user,
      tenantId,
      tests,
      persistLifecycleEvent,
    });
  }
  if (typeof mtoEventSink === 'function') {
    try {
      await mtoEventSink(
        createMtoEvent(
          'CANDIDATE',
          {
            traceId: normalizedTraceId,
            traceEventId: `candidate:${canonicalCandidateId}`,
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
  return { candidateId: canonicalCandidateId };
}
module.exports = { recordSkillImprovementProposal };
