const { createImprovementPayloadDigest } = require('@librechat/api');
const {
  loadSkillImprovementReview,
  decideSkillImprovementReview,
} = require('./improvementSkillReview');

function setupCreate(extraEvents = []) {
  const create = { name: 'new-skill', body: '# New skill', description: 'New governed skill.' };
  const payloadDigest = createImprovementPayloadDigest(create);
  const candidateId = 'skill:task:create';
  const traceId = 'trace-create';
  const snapshotDigest = 'snapshot-create';
  const userId = 'user-1';
  const proposal = {
    candidateId,
    traceId,
    operation: 'create',
    payloadDigest,
    diff: '+new skill',
    create,
  };
  const candidate = {
    candidateId,
    traceId,
    target: 'skill',
    status: 'CANDIDATE',
    payloadDigest,
    publication: { path: 'native-skill-authoring-required', requiresHumanReview: true },
  };
  const events = [
    {
      eventId: 'skill-tests:verified:' + candidateId,
      type: 'VERIFIED',
      actor: { type: 'host' },
      data: { payloadDigest, checks: [{ id: 'content', passed: true }] },
    },
    {
      eventId: 'skill-oracle:' + candidateId,
      type: 'VERIFIED',
      actor: { id: 'oracle-1', type: 'oracle' },
      data: {
        validatorId: 'oracle-1',
        payloadDigest,
        oracleDecision: 'ACCEPT',
        disposition: 'AUTHORIZATION_REQUIRED',
      },
    },
    ...extraEvents,
  ];
  const context = {
    req: { user: { id: userId } },
    tenantId: 'tenant-1',
    candidateId,
    getProposal: jest.fn(async () => ({ proposal, snapshotDigest })),
    getCandidate: jest.fn(async () => candidate),
    listEvents: jest.fn(async () => events),
    canView: jest.fn(async () => {
      throw new Error('create must not require existing skill ACL');
    }),
    getSkillById: jest.fn(async () => {
      throw new Error('create review must not inspect native skill state yet');
    }),
    recordEvent: jest.fn(async () => ({ replayed: false })),
    authorize: jest.fn(async (input) => ({
      candidateId,
      traceId,
      target: 'skill',
      operation: 'create',
      actorId: input.actorId,
      payloadDigest,
      publicationPath: 'native-skill-authoring-required',
      authorized: true,
      publishable: true,
    })),
    publish: jest.fn(async () => {
      throw new Error('create review must not publish yet');
    }),
  };
  return { context, proposal, payloadDigest, snapshotDigest, candidateId, traceId, userId };
}

test('loads verified create review without existing skill ACL', async () => {
  const { context, payloadDigest, snapshotDigest } = setupCreate();
  const review = await loadSkillImprovementReview(context);
  expect(review).toMatchObject({
    operation: 'create',
    payloadDigest,
    snapshotDigest,
    quality: 'VERIFIED',
  });
  expect(review).not.toHaveProperty('skillId');
  expect(review).not.toHaveProperty('expectedVersion');
  expect(context.canView).not.toHaveBeenCalled();
});

test('approves and durably authorizes create without publishing', async () => {
  const { context, payloadDigest, snapshotDigest, userId } = setupCreate();
  const result = await decideSkillImprovementReview({
    ...context,
    decision: 'approve',
    payloadDigest,
    snapshotDigest,
  });
  expect(result).toEqual({ status: 'authorized', operation: 'create' });
  expect(context.recordEvent.mock.calls.map(([arg]) => arg.event.type)).toEqual([
    'APPROVED',
    'AUTHORIZED',
  ]);
  expect(context.recordEvent.mock.calls[0][0].event.data).toEqual({
    operation: 'create',
    payloadDigest,
    snapshotDigest,
  });
  expect(context.recordEvent.mock.calls[1][0].event.data).toEqual({
    operation: 'create',
    payloadDigest,
    snapshotDigest,
    actorId: userId,
  });
  expect(context.authorize).toHaveBeenCalledWith(
    expect.objectContaining({ operation: 'create', actorId: userId, payloadDigest }),
  );
  expect(context.authorize.mock.calls[0][0]).not.toHaveProperty('skillId');
  expect(context.authorize.mock.calls[0][0]).not.toHaveProperty('expectedVersion');
  expect(context.publish).not.toHaveBeenCalled();
});

test('rejects create without authorization or publication', async () => {
  const { context, payloadDigest, snapshotDigest } = setupCreate();
  const result = await decideSkillImprovementReview({
    ...context,
    decision: 'reject',
    payloadDigest,
    snapshotDigest,
  });
  expect(result).toEqual({ status: 'rejected' });
  expect(context.recordEvent.mock.calls.map(([arg]) => arg.event.type)).toEqual(['REJECTED']);
  expect(context.authorize).not.toHaveBeenCalled();
  expect(context.publish).not.toHaveBeenCalled();
});

test('recovers exact approved and authorized create without mutation', async () => {
  const base = setupCreate();
  const approval = {
    eventId: 'skill-review:' + base.candidateId,
    candidateId: base.candidateId,
    traceId: base.traceId,
    type: 'APPROVED',
    actor: { id: base.userId, type: 'human' },
    data: {
      operation: 'create',
      payloadDigest: base.payloadDigest,
      snapshotDigest: base.snapshotDigest,
    },
  };
  const authorization = {
    eventId: 'skill-authorization:' + base.candidateId,
    candidateId: base.candidateId,
    traceId: base.traceId,
    type: 'AUTHORIZED',
    actor: { id: 'librechat:native-skill-authorization', type: 'policy' },
    data: {
      operation: 'create',
      payloadDigest: base.payloadDigest,
      snapshotDigest: base.snapshotDigest,
      actorId: base.userId,
    },
  };
  const { context, payloadDigest, snapshotDigest } = setupCreate([approval, authorization]);
  const result = await decideSkillImprovementReview({
    ...context,
    decision: 'approve',
    payloadDigest,
    snapshotDigest,
  });
  expect(result).toEqual({ status: 'authorized', operation: 'create', recovered: true });
  expect(context.recordEvent).not.toHaveBeenCalled();
  expect(context.authorize).not.toHaveBeenCalled();
  expect(context.getSkillById).not.toHaveBeenCalled();
  expect(context.publish).not.toHaveBeenCalled();
});

test('fails closed when durable create authorization invents update identity', async () => {
  const base = setupCreate();
  const approval = {
    eventId: 'skill-review:' + base.candidateId,
    candidateId: base.candidateId,
    traceId: base.traceId,
    type: 'APPROVED',
    actor: { id: base.userId, type: 'human' },
    data: {
      operation: 'create',
      payloadDigest: base.payloadDigest,
      snapshotDigest: base.snapshotDigest,
    },
  };
  const authorization = {
    eventId: 'skill-authorization:' + base.candidateId,
    candidateId: base.candidateId,
    traceId: base.traceId,
    type: 'AUTHORIZED',
    actor: { id: 'librechat:native-skill-authorization', type: 'policy' },
    data: {
      operation: 'create',
      payloadDigest: base.payloadDigest,
      snapshotDigest: base.snapshotDigest,
      actorId: base.userId,
      skillId: 'invented-skill',
      expectedVersion: 1,
    },
  };
  const { context, payloadDigest, snapshotDigest } = setupCreate([approval, authorization]);
  await expect(
    decideSkillImprovementReview({
      ...context,
      decision: 'approve',
      payloadDigest,
      snapshotDigest,
    }),
  ).rejects.toThrow('durable authorization receipt is invalid');
  expect(context.authorize).not.toHaveBeenCalled();
  expect(context.getSkillById).not.toHaveBeenCalled();
  expect(context.publish).not.toHaveBeenCalled();
});

test('fails closed when create proposal invents update identity', async () => {
  const { context } = setupCreate();
  const originalGetProposal = context.getProposal;
  context.getProposal = jest.fn(async (...args) => {
    const record = await originalGetProposal(...args);
    return {
      ...record,
      proposal: { ...record.proposal, skillId: 'invented-skill', expectedVersion: 1 },
    };
  });
  await expect(loadSkillImprovementReview(context)).rejects.toThrow(
    'Skill create review proposal identity is invalid',
  );
  expect(context.canView).not.toHaveBeenCalled();
});
