const { createImprovementPayloadDigest } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');

function fail(message) {
  const error = new Error(message);
  error.status = 409;
  throw error;
}

/** Loads the immutable proposal only in its authenticated owner and tenant scope. */
async function loadSkillImprovementReview({
  req,
  tenantId,
  candidateId,
  getProposal,
  getCandidate,
  listEvents,
  canView,
}) {
  const user = req?.user?.id ?? req?.user?._id?.toString?.();
  if (!user || typeof candidateId !== 'string' || !candidateId.trim())
    fail('Skill review requires an authenticated owner and candidate ID');
  const scope = { user, tenantId, candidateId };
  const record = await getProposal(scope);
  const candidate = await getCandidate(scope);
  if (
    !record ||
    !candidate ||
    record.proposal?.candidateId !== candidateId ||
    candidate.candidateId !== candidateId
  )
    fail('Skill review is unavailable');
  const proposal = record.proposal;
  if (
    proposal.traceId !== candidate.traceId ||
    proposal.payloadDigest !== candidate.payloadDigest ||
    candidate.target !== 'skill' ||
    candidate.status !== 'CANDIDATE' ||
    candidate.publication?.path !== 'native-skill-authoring-required' ||
    candidate.publication?.requiresHumanReview !== true
  )
    fail('Skill review candidate binding is invalid');
  if (
    createImprovementPayloadDigest(proposal.update) !== proposal.payloadDigest ||
    typeof proposal.diff !== 'string' ||
    !proposal.diff
  )
    fail('Skill review payload digest or diff is invalid');
  if ((await canView({ req, skillId: proposal.skillId })) !== true)
    fail('Skill review access denied');
  const events = await listEvents(scope);
  const test = events.find(
    (event) =>
      event.eventId === `skill-tests:verified:${candidateId}` &&
      event.type === 'VERIFIED' &&
      event.actor?.type === 'host' &&
      event.data?.payloadDigest === proposal.payloadDigest &&
      Array.isArray(event.data?.checks) &&
      event.data.checks.length > 0 &&
      event.data.checks.every((check) => check.passed === true),
  );
  const oracle = events.find(
    (event) =>
      event.eventId === `skill-oracle:${candidateId}` &&
      event.type === 'VERIFIED' &&
      event.actor?.type === 'oracle' &&
      event.data?.validatorId === event.actor?.id &&
      event.data?.payloadDigest === proposal.payloadDigest &&
      event.data?.oracleDecision === 'ACCEPT' &&
      event.data?.disposition === 'AUTHORIZATION_REQUIRED',
  );
  const reviewed = events.some((event) => event.eventId === `skill-review:${candidateId}`);
  return {
    candidateId,
    traceId: candidate.traceId,
    skillId: proposal.skillId,
    expectedVersion: proposal.expectedVersion,
    diff: proposal.diff,
    payloadDigest: proposal.payloadDigest,
    snapshotDigest: record.snapshotDigest,
    quality: test && oracle ? 'VERIFIED' : 'PENDING',
    reviewed,
    checks: test?.data.checks ?? [],
    proposal,
    candidate,
  };
}

/** A human request binds to the exact viewed snapshot; native policy is checked by publish. */
async function decideSkillImprovementReview({
  decision,
  payloadDigest,
  snapshotDigest,
  recordEvent,
  publish,
  ...context
}) {
  if (decision !== 'approve' && decision !== 'reject') fail('Skill review decision is invalid');
  const review = await loadSkillImprovementReview(context);
  if (payloadDigest !== review.payloadDigest || snapshotDigest !== review.snapshotDigest)
    fail('Skill review digest or snapshot mismatch');
  if (review.reviewed) fail('Skill review has already been decided');
  if (decision === 'approve' && review.quality !== 'VERIFIED')
    fail('Skill review requires verified tests and Oracle');
  const user = context.req.user.id ?? context.req.user._id.toString();
  const scope = { user, tenantId: context.tenantId };
  const outcome = await recordEvent({
    ...scope,
    event: {
      eventId: `skill-review:${review.candidateId}`,
      candidateId: review.candidateId,
      traceId: review.traceId,
      type: decision === 'approve' ? 'APPROVED' : 'REJECTED',
      actor: { id: String(user), type: 'human' },
      data: {
        payloadDigest,
        snapshotDigest,
        skillId: review.skillId,
        expectedVersion: review.expectedVersion,
      },
      occurredAt: new Date().toISOString(),
    },
  });
  if (outcome.replayed) fail('Skill review has already been decided');
  if (decision === 'reject') return { status: 'rejected' };
  const disposition = {
    candidateId: review.candidateId,
    traceId: review.traceId,
    target: 'skill',
    payloadDigest: review.payloadDigest,
    oracleDecision: 'ACCEPT',
    disposition: 'AUTHORIZATION_REQUIRED',
    publicationPath: 'native-skill-authoring-required',
    authorized: false,
    publishable: false,
    requiresHumanReview: true,
  };
  const result = await publish({
    req: context.req,
    disposition,
    operation: 'update',
    actorId: String(user),
    skillId: review.skillId,
    expectedVersion: review.expectedVersion,
    update: review.proposal.update,
  });
  if (result?.status === 'updated') {
    try {
      await recordEvent({
        ...scope,
        event: {
          eventId: `skill-commit:${review.candidateId}`,
          candidateId: review.candidateId,
          traceId: review.traceId,
          type: 'COMMITTED',
          actor: { id: 'librechat:native-skill-update', type: 'host' },
          data: {
            payloadDigest,
            snapshotDigest,
            skillId: review.skillId,
            expectedVersion: review.expectedVersion,
          },
          occurredAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.warn(
        '[BOT MODE P10] Native skill update committed; lifecycle observation pending',
        error,
      );
      return { ...result, observationPending: true };
    }
  }
  return result;
}
module.exports = { loadSkillImprovementReview, decideSkillImprovementReview };
