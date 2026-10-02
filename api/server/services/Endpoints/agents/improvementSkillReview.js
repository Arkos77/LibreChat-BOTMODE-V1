const { createHash } = require('crypto');
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
  const operation = proposal.operation === 'create' ? 'create' : 'update';
  if (
    operation === 'create' &&
    (proposal.skillId !== undefined || proposal.expectedVersion !== undefined)
  )
    fail('Skill create review proposal identity is invalid');
  const payload = operation === 'create' ? proposal.create : proposal.update;
  if (
    createImprovementPayloadDigest(payload) !== proposal.payloadDigest ||
    typeof proposal.diff !== 'string' ||
    !proposal.diff
  )
    fail('Skill review payload digest or diff is invalid');
  if (operation === 'update' && (await canView({ req, skillId: proposal.skillId })) !== true)
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
  const allocationEvent = events.find(
    (event) => event.eventId === `skill-allocation:${candidateId}`,
  );
  const commitEvent = events.find((event) => event.eventId === `skill-commit:${candidateId}`);
  const reviewed = reviewEvent != null;
  return {
    candidateId,
    traceId: candidate.traceId,
    operation,
    ...(operation === 'update'
      ? { skillId: proposal.skillId, expectedVersion: proposal.expectedVersion }
      : {}),
    diff: proposal.diff,
    payloadDigest: proposal.payloadDigest,
    snapshotDigest: record.snapshotDigest,
    quality: test && oracle ? 'VERIFIED' : 'PENDING',
    reviewed,
    reviewEvent,
    authorizationEvent,
    allocationEvent,
    commitEvent,
    checks: test?.data.checks ?? [],
    proposal,
    candidate,
  };
}

function exactReviewApproval(review, event, user) {
  const exact =
    event?.type === 'APPROVED' &&
    event?.actor?.type === 'human' &&
    event?.actor?.id === String(user) &&
    event?.data?.payloadDigest === review.payloadDigest &&
    event?.data?.snapshotDigest === review.snapshotDigest;
  if (!exact) return false;
  if (review.operation === 'create') {
    return (
      event.data?.operation === 'create' &&
      event.data?.skillId === undefined &&
      event.data?.expectedVersion === undefined
    );
  }
  return (
    event.data?.skillId === review.skillId && event.data?.expectedVersion === review.expectedVersion
  );
}

function exactAuthorizationReceipt(review, event, user) {
  const exact =
    event?.type === 'AUTHORIZED' &&
    event?.actor?.type === 'policy' &&
    event?.actor?.id === 'librechat:native-skill-authorization' &&
    event?.data?.payloadDigest === review.payloadDigest &&
    event?.data?.snapshotDigest === review.snapshotDigest &&
    event?.data?.actorId === String(user);
  if (!exact) return false;
  if (review.operation === 'create') {
    return (
      event.data?.operation === 'create' &&
      event.data?.skillId === undefined &&
      event.data?.expectedVersion === undefined
    );
  }
  return (
    event.data?.skillId === review.skillId && event.data?.expectedVersion === review.expectedVersion
  );
}

function createSkillAllocationId(review, user, tenantId) {
  return createHash('sha256')
    .update(
      [
        'librechat:governed-skill-create:v1',
        String(user),
        typeof tenantId === 'string' ? tenantId.trim() : '',
        review.candidateId,
        review.traceId,
        review.payloadDigest,
        review.snapshotDigest,
      ].join('\0'),
    )
    .digest('hex')
    .slice(0, 24);
}

function exactCreateAllocationReceipt(review, event) {
  return (
    event?.eventId === `skill-allocation:${review.candidateId}` &&
    event?.candidateId === review.candidateId &&
    event?.traceId === review.traceId &&
    event?.type === 'ALLOCATED' &&
    event?.actor?.type === 'host' &&
    event?.actor?.id === 'librechat:native-skill-create' &&
    event?.data?.operation === 'create' &&
    event?.data?.payloadDigest === review.payloadDigest &&
    event?.data?.snapshotDigest === review.snapshotDigest &&
    typeof event?.data?.skillId === 'string' &&
    /^[a-f0-9]{24}$/i.test(event.data.skillId)
  );
}

function exactNativeCreateReceipt(review, skill, skillId) {
  const receipt = skill?.lastImprovementMutation;
  return (
    skill?._id?.toString?.() === skillId &&
    skill?.version === 1 &&
    receipt?.operation === 'create' &&
    receipt?.candidateId === review.candidateId &&
    receipt?.payloadDigest === review.payloadDigest
  );
}

async function recordCreateCommittedObservation({
  review,
  scope,
  recordEvent,
  mtoEventSink,
  skillId,
  committedAt,
}) {
  await recordEvent({
    ...scope,
    event: {
      eventId: `skill-commit:${review.candidateId}`,
      candidateId: review.candidateId,
      traceId: review.traceId,
      type: 'COMMITTED',
      actor: { id: 'librechat:native-skill-create', type: 'host' },
      data: {
        operation: 'create',
        payloadDigest: review.payloadDigest,
        snapshotDigest: review.snapshotDigest,
        skillId,
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
        logger.warn('[BOT MODE P10] Failed to emit committed create observation', {
          name: error?.name,
        });
      } catch (_) {
        // MTO observation failures cannot change an already-committed native create.
      }
    }
  }
}

async function continueSkillCreate({ review, context, scope, recordEvent, mtoEventSink, user }) {
  let allocation = review.allocationEvent;
  if (allocation != null && !exactCreateAllocationReceipt(review, allocation)) {
    fail('Skill create review durable allocation receipt is invalid');
  }

  if (allocation == null) {
    const skillId = createSkillAllocationId(review, user, context.tenantId);
    const event = {
      eventId: `skill-allocation:${review.candidateId}`,
      candidateId: review.candidateId,
      traceId: review.traceId,
      type: 'ALLOCATED',
      actor: { id: 'librechat:native-skill-create', type: 'host' },
      data: {
        operation: 'create',
        payloadDigest: review.payloadDigest,
        snapshotDigest: review.snapshotDigest,
        skillId,
      },
      occurredAt: review.authorizationEvent?.occurredAt ?? new Date().toISOString(),
    };
    const outcome = await recordEvent({ ...scope, event });
    allocation = outcome?.record ?? event;
    if (!exactCreateAllocationReceipt(review, allocation)) {
      fail('Skill create review durable allocation receipt is invalid');
    }
  }

  const skillId = allocation.data.skillId;
  if (typeof context.getSkillById !== 'function') {
    fail('Skill create review recovery requires native skill state');
  }
  const current = await context.getSkillById(skillId);
  let result;
  const recovered = current != null;

  if (current == null) {
    if (typeof context.publishCreate !== 'function') {
      fail('Skill create review requires native create publication');
    }
    result = await context.publishCreate({
      req: context.req,
      candidateId: review.candidateId,
      payloadDigest: review.payloadDigest,
      skillId,
      create: review.proposal.create,
    });
    if (result?.status !== 'created' || result?.skillId !== skillId) {
      fail('Skill create review native publication result is invalid');
    }
    if (!exactNativeCreateReceipt(review, result.skill, skillId)) {
      fail('Skill create review native publication receipt is invalid');
    }
  } else {
    if (!exactNativeCreateReceipt(review, current, skillId)) {
      fail('Skill create review recovery cannot prove the authorized native mutation');
    }
    if (
      typeof context.hasSkillOwner !== 'function' ||
      typeof context.grantSkillOwner !== 'function'
    ) {
      fail('Skill create review owner ACL recovery primitives are unavailable');
    }
    if ((await context.hasSkillOwner({ req: context.req, skillId })) !== true) {
      await context.grantSkillOwner({ req: context.req, skillId });
      if ((await context.hasSkillOwner({ req: context.req, skillId })) !== true) {
        fail('Skill create review owner ACL recovery is not proven');
      }
    }
    result = { status: 'created', skillId, recovered: true };
  }

  const committedAt = new Date(current?.updatedAt ?? Date.now()).toISOString();
  try {
    await recordCreateCommittedObservation({
      review,
      scope,
      recordEvent,
      mtoEventSink,
      skillId,
      committedAt,
    });
  } catch (error) {
    logger.warn(
      '[BOT MODE P10] Native skill create committed; lifecycle observation pending',
      error,
    );
    return { ...result, ...(recovered ? { recovered: true } : {}), observationPending: true };
  }

  return { ...result, ...(recovered ? { recovered: true } : {}) };
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
    if (review.operation === 'create') {
      return continueSkillCreate({
        review,
        context,
        scope,
        recordEvent,
        mtoEventSink,
        user,
      });
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
          data:
            review.operation === 'create'
              ? { operation: 'create', payloadDigest, snapshotDigest }
              : {
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
  if (review.operation === 'create') {
    if (typeof context.authorize !== 'function') {
      fail('Skill create review requires native authorization');
    }
    const authorization = await context.authorize({
      req: context.req,
      disposition,
      operation: 'create',
      actorId: String(user),
      payloadDigest: review.payloadDigest,
      authorizationObservation: context.authorizationObservation,
    });
    if (
      authorization?.candidateId !== review.candidateId ||
      authorization?.traceId !== review.traceId ||
      authorization?.target !== 'skill' ||
      authorization?.operation !== 'create' ||
      authorization?.actorId !== String(user) ||
      authorization?.payloadDigest !== review.payloadDigest ||
      authorization?.skillId !== undefined ||
      authorization?.expectedVersion !== undefined ||
      authorization?.authorized !== true ||
      authorization?.publishable !== true
    ) {
      fail('Skill create review native authorization is invalid');
    }
    const authorizationEvent = {
      eventId: `skill-authorization:${review.candidateId}`,
      candidateId: review.candidateId,
      traceId: review.traceId,
      type: 'AUTHORIZED',
      actor: { id: 'librechat:native-skill-authorization', type: 'policy' },
      data: {
        operation: 'create',
        payloadDigest,
        snapshotDigest,
        actorId: authorization.actorId,
      },
      occurredAt: new Date().toISOString(),
    };
    const authorizationOutcome = await recordEvent({
      ...scope,
      event: authorizationEvent,
    });
    review.authorizationEvent = authorizationOutcome?.record ?? authorizationEvent;
    return continueSkillCreate({
      review,
      context,
      scope,
      recordEvent,
      mtoEventSink,
      user,
    });
  }

  const result = await publish({
    req: context.req,
    disposition,
    operation: 'update',
    actorId: String(user),
    skillId: review.skillId,
    expectedVersion: review.expectedVersion,
    update: review.proposal.update,
    authorizationObservation: context.authorizationObservation,
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
