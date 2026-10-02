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
    getSkillById: jest.fn(async () => null),
    recordEvent: jest.fn(async ({ event }) => ({ record: event, replayed: false })),
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
      throw new Error('update publisher must not handle create');
    }),
    publishCreate: jest.fn(async ({ skillId }) => ({
      status: 'created',
      skillId,
      skill: {
        _id: skillId,
        version: 1,
        lastImprovementMutation: {
          operation: 'create',
          candidateId,
          payloadDigest,
        },
      },
      warnings: [],
    })),
    hasSkillOwner: jest.fn(async () => true),
    grantSkillOwner: jest.fn(async () => ({})),
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

test('approves, authorizes, allocates, publishes, and commits create in order', async () => {
  const { context, payloadDigest, snapshotDigest, userId } = setupCreate();
  const result = await decideSkillImprovementReview({
    ...context,
    decision: 'approve',
    payloadDigest,
    snapshotDigest,
  });

  expect(result).toMatchObject({ status: 'created' });
  expect(context.recordEvent.mock.calls.map(([arg]) => arg.event.type)).toEqual([
    'APPROVED',
    'AUTHORIZED',
    'ALLOCATED',
    'COMMITTED',
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
  const allocation = context.recordEvent.mock.calls[2][0].event;
  expect(allocation.actor).toEqual({ id: 'librechat:native-skill-create', type: 'host' });
  expect(allocation.data).toEqual(
    expect.objectContaining({
      operation: 'create',
      payloadDigest,
      snapshotDigest,
      skillId: expect.stringMatching(/^[a-f0-9]{24}$/),
    }),
  );
  expect(context.publishCreate).toHaveBeenCalledWith({
    req: context.req,
    candidateId: context.candidateId,
    payloadDigest,
    skillId: allocation.data.skillId,
    create: expect.any(Object),
  });
  expect(context.recordEvent.mock.calls[3][0].event.data).toEqual({
    operation: 'create',
    payloadDigest,
    snapshotDigest,
    skillId: allocation.data.skillId,
  });
  expect(context.authorize).toHaveBeenCalledWith(
    expect.objectContaining({ operation: 'create', actorId: userId, payloadDigest }),
  );
  expect(context.authorize.mock.calls[0][0]).not.toHaveProperty('skillId');
  expect(context.authorize.mock.calls[0][0]).not.toHaveProperty('expectedVersion');
  expect(context.getSkillById).toHaveBeenCalledWith(allocation.data.skillId);
  expect(context.publish).not.toHaveBeenCalled();
});

test('uses the durable authorization timestamp for a replay-convergent create allocation', async () => {
  const base = setupCreate();
  const occurredAt = '2026-10-02T17:00:00.000Z';
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
    occurredAt,
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
    occurredAt,
  };
  const { context, payloadDigest, snapshotDigest } = setupCreate([approval, authorization]);

  await decideSkillImprovementReview({
    ...context,
    decision: 'approve',
    payloadDigest,
    snapshotDigest,
  });

  const allocation = context.recordEvent.mock.calls[0][0].event;
  expect(allocation.type).toBe('ALLOCATED');
  expect(allocation.occurredAt).toBe(occurredAt);
});

test('does not commit create when publication cannot prove the exact native create receipt', async () => {
  const { context, payloadDigest, snapshotDigest, candidateId } = setupCreate();
  context.publishCreate.mockImplementation(async ({ skillId }) => ({
    status: 'created',
    skillId,
    skill: {
      _id: skillId,
      version: 1,
      lastImprovementMutation: {
        operation: 'create',
        candidateId: candidateId + ':conflict',
        payloadDigest,
      },
    },
    warnings: [],
  }));

  await expect(
    decideSkillImprovementReview({
      ...context,
      decision: 'approve',
      payloadDigest,
      snapshotDigest,
    }),
  ).rejects.toThrow(/receipt|prove|publication/i);

  expect(context.recordEvent.mock.calls.map(([arg]) => arg.event.type)).toEqual([
    'APPROVED',
    'AUTHORIZED',
    'ALLOCATED',
  ]);
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

test('recovers exact approved and authorized create by allocating before publication', async () => {
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

  expect(result).toMatchObject({ status: 'created' });
  expect(context.recordEvent.mock.calls.map(([arg]) => arg.event.type)).toEqual([
    'ALLOCATED',
    'COMMITTED',
  ]);
  expect(context.publishCreate).toHaveBeenCalledTimes(1);
  expect(context.publish).not.toHaveBeenCalled();
});

test('repairs missing owner ACL for an exact receipt-bearing allocated create without recreating skill', async () => {
  const base = setupCreate();
  const skillId = '68df12a7d43d9b79b2b5a001';
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
  const allocation = {
    eventId: 'skill-allocation:' + base.candidateId,
    candidateId: base.candidateId,
    traceId: base.traceId,
    type: 'ALLOCATED',
    actor: { id: 'librechat:native-skill-create', type: 'host' },
    data: {
      operation: 'create',
      payloadDigest: base.payloadDigest,
      snapshotDigest: base.snapshotDigest,
      skillId,
    },
  };
  const { context, payloadDigest, snapshotDigest } = setupCreate([
    approval,
    authorization,
    allocation,
  ]);
  context.getSkillById.mockResolvedValue({
    _id: skillId,
    version: 1,
    updatedAt: '2026-10-02T17:00:00.000Z',
    lastImprovementMutation: {
      operation: 'create',
      candidateId: base.candidateId,
      payloadDigest,
    },
  });
  context.hasSkillOwner.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

  const result = await decideSkillImprovementReview({
    ...context,
    decision: 'approve',
    payloadDigest,
    snapshotDigest,
  });

  expect(result).toEqual({ status: 'created', skillId, recovered: true });
  expect(context.publishCreate).not.toHaveBeenCalled();
  expect(context.grantSkillOwner).toHaveBeenCalledWith({ req: context.req, skillId });
  expect(context.hasSkillOwner).toHaveBeenCalledTimes(2);
  expect(context.recordEvent.mock.calls.map(([arg]) => arg.event.type)).toEqual(['COMMITTED']);
});

test('replays exact allocated create with existing owner by repairing COMMITTED without mutation', async () => {
  const base = setupCreate();
  const skillId = '68df12a7d43d9b79b2b5a001';
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
  const allocation = {
    eventId: 'skill-allocation:' + base.candidateId,
    candidateId: base.candidateId,
    traceId: base.traceId,
    type: 'ALLOCATED',
    actor: { id: 'librechat:native-skill-create', type: 'host' },
    data: {
      operation: 'create',
      payloadDigest: base.payloadDigest,
      snapshotDigest: base.snapshotDigest,
      skillId,
    },
  };
  const { context, payloadDigest, snapshotDigest } = setupCreate([
    approval,
    authorization,
    allocation,
  ]);
  context.getSkillById.mockResolvedValue({
    _id: skillId,
    version: 1,
    updatedAt: '2026-10-02T17:00:00.000Z',
    lastImprovementMutation: {
      operation: 'create',
      candidateId: base.candidateId,
      payloadDigest,
    },
  });
  context.hasSkillOwner.mockResolvedValue(true);

  const result = await decideSkillImprovementReview({
    ...context,
    decision: 'approve',
    payloadDigest,
    snapshotDigest,
  });

  expect(result).toEqual({ status: 'created', skillId, recovered: true });
  expect(context.publishCreate).not.toHaveBeenCalled();
  expect(context.grantSkillOwner).not.toHaveBeenCalled();
  expect(context.hasSkillOwner).toHaveBeenCalledTimes(1);
  expect(context.recordEvent.mock.calls.map(([arg]) => arg.event.type)).toEqual(['COMMITTED']);
});

test('fails closed on conflicting native state at the durable create allocation', async () => {
  const base = setupCreate();
  const skillId = '68df12a7d43d9b79b2b5a001';
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
  const allocation = {
    eventId: 'skill-allocation:' + base.candidateId,
    candidateId: base.candidateId,
    traceId: base.traceId,
    type: 'ALLOCATED',
    actor: { id: 'librechat:native-skill-create', type: 'host' },
    data: {
      operation: 'create',
      payloadDigest: base.payloadDigest,
      snapshotDigest: base.snapshotDigest,
      skillId,
    },
  };
  const { context, payloadDigest, snapshotDigest } = setupCreate([
    approval,
    authorization,
    allocation,
  ]);
  context.getSkillById.mockResolvedValue({
    _id: skillId,
    version: 1,
    lastImprovementMutation: {
      operation: 'create',
      candidateId: 'another-candidate',
      payloadDigest,
    },
  });

  await expect(
    decideSkillImprovementReview({
      ...context,
      decision: 'approve',
      payloadDigest,
      snapshotDigest,
    }),
  ).rejects.toThrow(/cannot prove|conflict/i);

  expect(context.publishCreate).not.toHaveBeenCalled();
  expect(context.grantSkillOwner).not.toHaveBeenCalled();
  expect(context.recordEvent).not.toHaveBeenCalled();
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

test('returns observationPending when CREATE commit persistence fails after native success', async () => {
  const { context, payloadDigest, snapshotDigest } = setupCreate();
  context.recordEvent.mockImplementation(async ({ event }) => {
    if (event.type === 'COMMITTED') throw new Error('commit-store-down');
    return { record: event, replayed: false };
  });

  const result = await decideSkillImprovementReview({
    ...context,
    decision: 'approve',
    payloadDigest,
    snapshotDigest,
  });

  expect(result).toMatchObject({
    status: 'created',
    observationPending: true,
  });
  expect(context.publishCreate).toHaveBeenCalledTimes(1);
});

test('fails closed when durable create allocation trace identity mismatches review', async () => {
  const base = setupCreate();
  const skillId = '68df12a7d43d9b79b2b5a001';
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
  const allocation = {
    eventId: 'skill-allocation:' + base.candidateId,
    candidateId: base.candidateId,
    traceId: 'trace-tampered',
    type: 'ALLOCATED',
    actor: { id: 'librechat:native-skill-create', type: 'host' },
    data: {
      operation: 'create',
      payloadDigest: base.payloadDigest,
      snapshotDigest: base.snapshotDigest,
      skillId,
    },
  };
  const { context, payloadDigest, snapshotDigest } = setupCreate([
    approval,
    authorization,
    allocation,
  ]);

  await expect(
    decideSkillImprovementReview({
      ...context,
      decision: 'approve',
      payloadDigest,
      snapshotDigest,
    }),
  ).rejects.toThrow(/allocation receipt is invalid/i);

  expect(context.getSkillById).not.toHaveBeenCalled();
  expect(context.publishCreate).not.toHaveBeenCalled();
  expect(context.grantSkillOwner).not.toHaveBeenCalled();
  expect(context.recordEvent).not.toHaveBeenCalled();
});
