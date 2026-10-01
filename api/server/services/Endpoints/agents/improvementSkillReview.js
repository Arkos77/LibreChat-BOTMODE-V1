const { createImprovementPayloadDigest, createMtoEvent } = require('@librechat/api');
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
  const reviewEvent = events.find((event) => event.eventId === `skill-review:${candidateId}`);
  const authorizationEvent = events.find(
    (event) => event.eventId === `skill-authorization:${candidateId}`,
  );
  const commitEvent = events.find((event) => event.eventId === `skill-commit:${candidateId}`);
  const reviewed = reviewEvent != null;
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
    reviewEvent,
    authorizationEvent,
    commitEvent,
    checks: test?.data.checks ?? [],
    proposal,
    candidate,
  };
}

function exactReviewApproval(review, event, user) {
  return (
    event?.type === 'APPROVED' &&
    event?.actor?.type === 'human' &&
    event?.actor?.id === String(user) &&
    event?.data?.payloadDigest === review.payloadDigest &&
    event?.data?.snapshotDigest === review.snapshotDigest &&
    event?.data?.skillId === review.skillId &&
    event?.data?.expectedVersion === review.expectedVersion
  );
}

function exactAuthorizationReceipt(review, event, user) {
  return (
    event?.type === 'AUTHORIZED' &&
    event?.actor?.type === 'policy' &&
    event?.actor?.id === 'librechat:native-skill-authorization' &&
    event?.data?.payloadDigest === review.payloadDigest &&
    event?.data?.snapshotDigest === review.snapshotDigest &&
    event?.data?.actorId === String(user) &&
    event?.data?.skillId === review.skillId &&
    event?.data?.expectedVersion === review.expectedVersion
  );
}

function exactNativeMutationReceipt(review, skill) {
  const receipt = skill?.lastImprovementMutation;
  return (
    skill?.version === review.expectedVersion + 1 &&
    receipt?.candidateId === review.candidateId &&
    receipt?.payloadDigest === review.payloadDigest &&
    receipt?.expectedVersion === review.expectedVersion
  );
}

async function recordCommittedObservation({
  review,
  scope,
  recordEvent,
  mtoEventSink,
  committedAt,
}) {
  await recordEvent({
    ...scope,
    event: {
      eventId: `skill-commit:${review.candidateId}`,
      candidateId: review.candidateId,
      traceId: review.traceId,
      type: 'COMMITTED',
      actor: { id: 'librechat:native-skill-update', type: 'host' },
      data: {
        payloadDigest: review.payloadDigest,
        snapshotDigest: review.snapshotDigest,
        skillId: review.skillId,
        expectedVersion: review.expectedVersion,
      },
      occurredAt: committedAt,
    },
  });

  if (typeof mtoEventSink === 'function') {
    try {
      await mtoEventSink(
        createMtoEvent(
          'COMMITTED',
          {
            traceId: review.traceId,
            traceEventId: `skill-commit:${review.candidateId}`,
            ...(typeof review.proposal.taskId === 'string' && review.proposal.taskId.trim()
              ? { taskId: review.proposal.taskId.trim() }
              : {}),
            ...(typeof review.proposal.producerAgentId === 'string' &&
            review.proposal.producerAgentId.trim()
              ? { agentId: review.proposal.producerAgentId.trim() }
              : {}),
            timestamp: committedAt,
          },
          'host',
        ),
      );
    } catch (error) {
      try {
        logger.warn('[BOT MODE P10] Failed to emit committed improvement observation', {
          name: error?.name,
        });
      } catch (_) {
        // MTO Observation failures cannot change an already-committed native update.
      }
    }
  }
}

/** A human request binds to the exact viewed snapshot; native policy is checked by publish. */
async function decideSkillImprovementReview({
  decision,
  payloadDigest,
  snapshotDigest,
  recordEvent,
  publish,
  mtoEventSink,
  ...context
}) {
  if (decision !== 'approve' && decision !== 'reject') fail('Skill review decision is invalid');
  const review = await loadSkillImprovementReview(context);
  if (payloadDigest !== review.payloadDigest || snapshotDigest !== review.snapshotDigest)
    fail('Skill review digest or snapshot mismatch');
  const user = context.req.user.id ?? context.req.user._id.toString();
  const scope = { user, tenantId: context.tenantId };
  let recoveryAuthorization = null;

  if (review.reviewed) {
    if (
      decision !== 'approve' ||
      !exactReviewApproval(review, review.reviewEvent, user) ||
      review.commitEvent
    ) {
      fail('Skill review has already been decided');
    }
    if (!exactAuthorizationReceipt(review, review.authorizationEvent, user)) {
      fail('Skill review durable authorization receipt is invalid');
    }
    if (typeof context.getSkillById !== 'function') {
      fail('Skill review recovery requires native skill state');
    }
    const current = await context.getSkillById(review.skillId);
    if (!current) fail('Skill review recovery cannot find the native skill');

    if (current.version === review.expectedVersion) {
      recoveryAuthorization = review.authorizationEvent;
    } else if (exactNativeMutationReceipt(review, current)) {
      const committedAt = new Date(current.updatedAt ?? Date.now()).toISOString();
      try {
        await recordCommittedObservation({
          review,
          scope,
          recordEvent,
          mtoEventSink,
          committedAt,
        });
      } catch (error) {
        logger.warn(
          '[BOT MODE P10] Proven native skill update found; lifecycle observation still pending',
          error,
        );
        return { status: 'updated', recovered: true, observationPending: true };
      }
      return { status: 'updated', recovered: true };
    } else {
      fail('Skill review recovery cannot prove the authorized native mutation');
    }
  }

  if (decision === 'approve' && review.quality !== 'VERIFIED')
    fail('Skill review requires verified tests and Oracle');

  const outcome = review.reviewed
    ? { replayed: false }
    : await recordEvent({
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
    onAuthorized: async (authorization) => {
      if (recoveryAuthorization) {
        if (
          authorization.actorId !== recoveryAuthorization.data.actorId ||
          authorization.skillId !== recoveryAuthorization.data.skillId ||
          authorization.expectedVersion !== recoveryAuthorization.data.expectedVersion ||
          authorization.payloadDigest !== recoveryAuthorization.data.payloadDigest
        ) {
          fail('Skill review current authorization does not match durable receipt');
        }
        return;
      }
      await recordEvent({
        ...scope,
        event: {
          eventId: `skill-authorization:${review.candidateId}`,
          candidateId: review.candidateId,
          traceId: review.traceId,
          type: 'AUTHORIZED',
          actor: { id: 'librechat:native-skill-authorization', type: 'policy' },
          data: {
            payloadDigest,
            snapshotDigest,
            actorId: authorization.actorId,
            skillId: authorization.skillId,
            expectedVersion: authorization.expectedVersion,
          },
          occurredAt: new Date().toISOString(),
        },
      });
    },
  });
  if (result?.status === 'updated') {
    const committedAt = new Date().toISOString();
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
          occurredAt: committedAt,
        },
      });
    } catch (error) {
      logger.warn(
        '[BOT MODE P10] Native skill update committed; lifecycle observation pending',
        error,
      );
      return { ...result, observationPending: true };
    }

    if (typeof mtoEventSink === 'function') {
      try {
        await mtoEventSink(
          createMtoEvent(
            'COMMITTED',
            {
              traceId: review.traceId,
              traceEventId: `skill-commit:${review.candidateId}`,
              ...(typeof review.proposal.taskId === 'string' && review.proposal.taskId.trim()
                ? { taskId: review.proposal.taskId.trim() }
                : {}),
              ...(typeof review.proposal.producerAgentId === 'string' &&
              review.proposal.producerAgentId.trim()
                ? { agentId: review.proposal.producerAgentId.trim() }
                : {}),
              timestamp: committedAt,
            },
            'host',
          ),
        );
      } catch (error) {
        try {
          logger.warn('[BOT MODE P10] Failed to emit committed improvement observation', {
            name: error?.name,
          });
        } catch (_) {
          // MTO observation failures cannot change an already-committed native update.
        }
      }
    }
  }
  return result;
}
module.exports = { loadSkillImprovementReview, decideSkillImprovementReview };
