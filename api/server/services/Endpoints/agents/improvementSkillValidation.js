const {
  runSkillContentTests,
  createDistillValidationRequest,
  deterministicOracle,
  createImprovementDisposition,
} = require('@librechat/api');

const CHECKER_ID = 'librechat:host-skill-tests';

/** Executes only host-declared tests over the immutable proposed payload. */
async function validateSkillImprovementCandidate({
  candidate,
  proposal,
  user,
  tenantId,
  tests,
  persistLifecycleEvent,
}) {
  if (
    candidate?.target !== 'skill' ||
    candidate?.publication?.requiresHumanReview !== true ||
    candidate?.candidateId !== proposal?.candidateId ||
    candidate?.traceId !== proposal?.traceId ||
    candidate?.payloadDigest !== proposal?.payloadDigest ||
    !user ||
    typeof persistLifecycleEvent !== 'function'
  ) {
    throw new Error('Skill tests candidate and proposal binding is invalid');
  }
  const payload = proposal.operation === 'create' ? proposal.create : proposal.update;
  const result = runSkillContentTests({
    candidateId: candidate.candidateId,
    producerAgentId: proposal.producerAgentId,
    checkerAgentId: CHECKER_ID,
    payloadDigest: candidate.payloadDigest,
    payload,
    tests,
  });
  const scope = { user, ...(tenantId ? { tenantId } : {}) };
  const record = (type, data) =>
    persistLifecycleEvent({
      ...scope,
      event: {
        eventId: `skill-tests:${type.toLowerCase()}:${candidate.candidateId}`,
        candidateId: candidate.candidateId,
        traceId: candidate.traceId,
        type,
        actor: { id: CHECKER_ID, type: 'host' },
        ...(data ? { data } : {}),
        occurredAt: candidate.createdAt,
      },
    });
  await record('VALIDATING', { payloadDigest: result.payloadDigest });
  await record(result.status, {
    payloadDigest: result.payloadDigest,
    checkerAgentId: result.checkerAgentId,
    checks: result.checks,
  });
  if (result.status === 'VERIFIED') {
    const request = createDistillValidationRequest({
      taskId: proposal.taskId,
      producerAgentId: proposal.producerAgentId,
      candidate,
      evidence: [
        {
          id: `host-tests:${candidate.candidateId}`,
          criterionId: 'target',
          value: 'skill',
          source: { id: CHECKER_ID, type: 'tool', agentId: CHECKER_ID },
        },
      ],
    });
    const verdict = await deterministicOracle.validate(request.oracleInput);
    const decision = {
      VERIFIED: 'ACCEPT',
      REJECTED: 'REJECT',
      UNKNOWN: 'DEFER',
      HUMAN_REVIEW: 'REQUEST_HUMAN_REVIEW',
    }[verdict.status];
    const disposition = createImprovementDisposition({
      candidate,
      oracle: { phase: verdict.status, verdict, decision },
    });
    await persistLifecycleEvent({
      ...scope,
      event: {
        eventId: `skill-oracle:${candidate.candidateId}`,
        candidateId: candidate.candidateId,
        traceId: candidate.traceId,
        type: verdict.status,
        actor: { id: verdict.validator.id, type: 'oracle' },
        data: {
          payloadDigest: result.payloadDigest,
          oracleDecision: decision,
          disposition: disposition.disposition,
          validatorId: verdict.validator.id,
        },
        occurredAt: candidate.createdAt,
      },
    });
    return { ...result, disposition };
  }
  return result;
}
module.exports = { validateSkillImprovementCandidate };
