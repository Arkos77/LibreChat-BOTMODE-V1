const { runSkillContentTests } = require('@librechat/api');

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
  const result = runSkillContentTests({
    candidateId: candidate.candidateId,
    producerAgentId: proposal.producerAgentId,
    checkerAgentId: CHECKER_ID,
    payloadDigest: candidate.payloadDigest,
    update: proposal.update,
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
  return result;
}
module.exports = { validateSkillImprovementCandidate };
