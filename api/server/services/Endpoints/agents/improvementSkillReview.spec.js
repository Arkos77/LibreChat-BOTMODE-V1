const { createImprovementPayloadDigest } = require('@librechat/api');
const {
  loadSkillImprovementReview,
  decideSkillImprovementReview,
} = require('./improvementSkillReview');
const update = { body: '# New skill', description: 'Revised skill.' };
const digest = createImprovementPayloadDigest(update);
function setup(overrides = {}) {
  const proposal = {
    candidateId: 'skill:task:call',
    traceId: 'trace',
    skillId: 'skill-1',
    expectedVersion: 3,
    payloadDigest: digest,
    diff: '-old\n+new',
    update,
  };
  const candidate = {
    candidateId: proposal.candidateId,
    traceId: 'trace',
    target: 'skill',
    status: 'CANDIDATE',
    payloadDigest: digest,
    publication: { path: 'native-skill-authoring-required', requiresHumanReview: true },
  };
  const events = [
    {
      eventId: 'skill-tests:verified:skill:task:call',
      type: 'VERIFIED',
      actor: { type: 'host' },
      data: { payloadDigest: digest, checks: [{ id: 'content', passed: true }] },
    },
    {
      eventId: 'skill-oracle:skill:task:call',
      type: 'VERIFIED',
      actor: { type: 'oracle' },
      data: {
        payloadDigest: digest,
        oracleDecision: 'ACCEPT',
        disposition: 'AUTHORIZATION_REQUIRED',
      },
    },
  ];
  return {
    req: { user: { id: '507f1f77bcf86cd799439011', role: 'USER' } },
    tenantId: 'tenant-1',
    candidateId: proposal.candidateId,
    getProposal: jest.fn(async () => ({ proposal, snapshotDigest: 'snapshot-1' })),
    getCandidate: jest.fn(async () => candidate),
    listEvents: jest.fn(async () => events),
    canView: jest.fn(async () => true),
    recordEvent: jest.fn(async () => ({ replayed: false })),
    publish: jest.fn(async (input) => {
      await input.onAuthorized?.({
        actorId: '507f1f77bcf86cd799439011',
        skillId: 'skill-1',
        expectedVersion: 3,
      });
      return { status: 'updated' };
    }),
    mtoEventSink: jest.fn(async () => undefined),
    ...overrides,
  };
}
describe('exact human skill review', () => {
  it('returns the durable diff and quality evidence only to its owner', async () => {
    const context = setup();
    const review = await loadSkillImprovementReview(context);
    expect(review).toMatchObject({
      diff: '-old\n+new',
      payloadDigest: digest,
      snapshotDigest: 'snapshot-1',
      quality: 'VERIFIED',
    });
    expect(context.getProposal).toHaveBeenCalledWith({
      user: context.req.user.id,
      tenantId: 'tenant-1',
      candidateId: context.candidateId,
    });
  });
  it('publishes only after exact human approval and native authorization', async () => {
    const context = setup();
    const result = await decideSkillImprovementReview({
      ...context,
      decision: 'approve',
      payloadDigest: digest,
      snapshotDigest: 'snapshot-1',
    });
    expect(result.status).toBe('updated');
    expect(context.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          type: 'APPROVED',
          actor: { type: 'human', id: context.req.user.id },
        }),
      }),
    );
    expect(context.publish.mock.invocationCallOrder[0]).toBeGreaterThan(
      context.recordEvent.mock.invocationCallOrder[0],
    );
    expect(context.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        update,
        skillId: 'skill-1',
        expectedVersion: 3,
        onAuthorized: expect.any(Function),
      }),
    );
    expect(context.recordEvent.mock.calls.map(([arg]) => arg.event.type)).toEqual([
      'APPROVED',
      'AUTHORIZED',
      'COMMITTED',
    ]);
    expect(context.mtoEventSink).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'COMMITTED',
        source: 'host',
        identity: expect.objectContaining({
          traceId: 'trace',
          traceEventId: 'skill-commit:skill:task:call',
        }),
      }),
    );
  });
  it('does not let MTO observation failure change an already-committed native update', async () => {
    const context = setup({
      mtoEventSink: jest.fn(async () => {
        throw new Error('mto unavailable');
      }),
    });
    const result = await decideSkillImprovementReview({
      ...context,
      decision: 'approve',
      payloadDigest: digest,
      snapshotDigest: 'snapshot-1',
    });
    expect(result).toEqual({ status: 'updated' });
    expect(context.publish).toHaveBeenCalledTimes(1);
    expect(context.recordEvent.mock.calls.map(([arg]) => arg.event.type)).toEqual([
      'APPROVED',
      'AUTHORIZED',
      'COMMITTED',
    ]);
  });

  it('fails closed before publication mutation when the durable AUTHORIZED receipt fails', async () => {
    const recordEvent = jest
      .fn()
      .mockResolvedValueOnce({ replayed: false })
      .mockRejectedValueOnce(new Error('authorization journal unavailable'));
    const context = setup({ recordEvent });
    await expect(
      decideSkillImprovementReview({
        ...context,
        decision: 'approve',
        payloadDigest: digest,
        snapshotDigest: 'snapshot-1',
      }),
    ).rejects.toThrow(/journal unavailable/i);
    expect(context.publish).toHaveBeenCalledTimes(1);
    expect(context.recordEvent.mock.calls.map(([arg]) => arg.event.type)).toEqual([
      'APPROVED',
      'AUTHORIZED',
    ]);
  });

  it('reports a successful native update when only the commit observation fails', async () => {
    const recordEvent = jest
      .fn()
      .mockResolvedValueOnce({ replayed: false })
      .mockResolvedValueOnce({ replayed: false })
      .mockRejectedValueOnce(new Error('journal unavailable'));
    const context = setup({ recordEvent });
    const result = await decideSkillImprovementReview({
      ...context,
      decision: 'approve',
      payloadDigest: digest,
      snapshotDigest: 'snapshot-1',
    });
    expect(result).toMatchObject({ status: 'updated', observationPending: true });
    expect(context.publish).toHaveBeenCalledTimes(1);
  });

  it('does not claim a commit when native version checking conflicts', async () => {
    const context = setup({ publish: jest.fn(async () => ({ status: 'conflict' })) });
    const result = await decideSkillImprovementReview({
      ...context,
      decision: 'approve',
      payloadDigest: digest,
      snapshotDigest: 'snapshot-1',
    });
    expect(result.status).toBe('conflict');
    expect(context.recordEvent.mock.calls.map(([arg]) => arg.event.type)).toEqual(['APPROVED']);
  });

  it('prevents replayed approval and never calls native publication', async () => {
    const replay = setup({ recordEvent: jest.fn(async () => ({ replayed: true })) });
    await expect(
      decideSkillImprovementReview({
        ...replay,
        decision: 'approve',
        payloadDigest: digest,
        snapshotDigest: 'snapshot-1',
      }),
    ).rejects.toThrow(/already/i);
    expect(replay.publish).not.toHaveBeenCalled();
  });
  it('retries an approved and authorized review exactly once when the native mutation did not happen', async () => {
    const userId = '507f1f77bcf86cd799439011';
    const recoveryEvents = [
      {
        eventId: 'skill-tests:verified:skill:task:call',
        type: 'VERIFIED',
        actor: { type: 'host' },
        data: { payloadDigest: digest, checks: [{ id: 'content', passed: true }] },
      },
      {
        eventId: 'skill-oracle:skill:task:call',
        type: 'VERIFIED',
        actor: { type: 'oracle' },
        data: {
          payloadDigest: digest,
          oracleDecision: 'ACCEPT',
          disposition: 'AUTHORIZATION_REQUIRED',
        },
      },
      {
        eventId: 'skill-review:skill:task:call',
        type: 'APPROVED',
        actor: { id: userId, type: 'human' },
        data: {
          payloadDigest: digest,
          snapshotDigest: 'snapshot-1',
          skillId: 'skill-1',
          expectedVersion: 3,
        },
      },
      {
        eventId: 'skill-authorization:skill:task:call',
        type: 'AUTHORIZED',
        actor: { id: 'librechat:native-skill-authorization', type: 'policy' },
        data: {
          payloadDigest: digest,
          snapshotDigest: 'snapshot-1',
          actorId: userId,
          skillId: 'skill-1',
          expectedVersion: 3,
        },
      },
    ];
    const publish = jest.fn(async (input) => {
      await input.onAuthorized?.({
        actorId: userId,
        skillId: 'skill-1',
        expectedVersion: 3,
        payloadDigest: digest,
      });
      return { status: 'updated' };
    });
    const context = setup({
      listEvents: jest.fn(async () => recoveryEvents),
      getSkillById: jest.fn(async () => ({ _id: 'skill-1', version: 3 })),
      publish,
    });

    const result = await decideSkillImprovementReview({
      ...context,
      decision: 'approve',
      payloadDigest: digest,
      snapshotDigest: 'snapshot-1',
    });

    expect(result).toEqual({ status: 'updated' });
    expect(context.getSkillById).toHaveBeenCalledWith('skill-1');
    expect(publish).toHaveBeenCalledTimes(1);
    expect(context.recordEvent.mock.calls.map(([arg]) => arg.event.type)).toEqual(['COMMITTED']);
  });

  it('repairs only the missing COMMITTED observation when the native receipt proves the mutation', async () => {
    const userId = '507f1f77bcf86cd799439011';
    const recoveryEvents = [
      {
        eventId: 'skill-tests:verified:skill:task:call',
        type: 'VERIFIED',
        actor: { type: 'host' },
        data: { payloadDigest: digest, checks: [{ id: 'content', passed: true }] },
      },
      {
        eventId: 'skill-oracle:skill:task:call',
        type: 'VERIFIED',
        actor: { type: 'oracle' },
        data: {
          payloadDigest: digest,
          oracleDecision: 'ACCEPT',
          disposition: 'AUTHORIZATION_REQUIRED',
        },
      },
      {
        eventId: 'skill-review:skill:task:call',
        type: 'APPROVED',
        actor: { id: userId, type: 'human' },
        data: {
          payloadDigest: digest,
          snapshotDigest: 'snapshot-1',
          skillId: 'skill-1',
          expectedVersion: 3,
        },
      },
      {
        eventId: 'skill-authorization:skill:task:call',
        type: 'AUTHORIZED',
        actor: { id: 'librechat:native-skill-authorization', type: 'policy' },
        data: {
          payloadDigest: digest,
          snapshotDigest: 'snapshot-1',
          actorId: userId,
          skillId: 'skill-1',
          expectedVersion: 3,
        },
      },
    ];
    const context = setup({
      listEvents: jest.fn(async () => recoveryEvents),
      getSkillById: jest.fn(async () => ({
        _id: 'skill-1',
        version: 4,
        updatedAt: '2026-10-01T00:00:00.000Z',
        lastImprovementMutation: {
          candidateId: 'skill:task:call',
          payloadDigest: digest,
          expectedVersion: 3,
        },
      })),
    });

    const result = await decideSkillImprovementReview({
      ...context,
      decision: 'approve',
      payloadDigest: digest,
      snapshotDigest: 'snapshot-1',
    });

    expect(result).toEqual({ status: 'updated', recovered: true });
    expect(context.publish).not.toHaveBeenCalled();
    expect(context.recordEvent.mock.calls.map(([arg]) => arg.event.type)).toEqual(['COMMITTED']);
    expect(context.mtoEventSink).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the native mutation receipt does not match the authorized candidate', async () => {
    const userId = '507f1f77bcf86cd799439011';
    const recoveryEvents = [
      {
        eventId: 'skill-tests:verified:skill:task:call',
        type: 'VERIFIED',
        actor: { type: 'host' },
        data: { payloadDigest: digest, checks: [{ id: 'content', passed: true }] },
      },
      {
        eventId: 'skill-oracle:skill:task:call',
        type: 'VERIFIED',
        actor: { type: 'oracle' },
        data: {
          payloadDigest: digest,
          oracleDecision: 'ACCEPT',
          disposition: 'AUTHORIZATION_REQUIRED',
        },
      },
      {
        eventId: 'skill-review:skill:task:call',
        type: 'APPROVED',
        actor: { id: userId, type: 'human' },
        data: {
          payloadDigest: digest,
          snapshotDigest: 'snapshot-1',
          skillId: 'skill-1',
          expectedVersion: 3,
        },
      },
      {
        eventId: 'skill-authorization:skill:task:call',
        type: 'AUTHORIZED',
        actor: { id: 'librechat:native-skill-authorization', type: 'policy' },
        data: {
          payloadDigest: digest,
          snapshotDigest: 'snapshot-1',
          actorId: userId,
          skillId: 'skill-1',
          expectedVersion: 3,
        },
      },
    ];
    const context = setup({
      listEvents: jest.fn(async () => recoveryEvents),
      getSkillById: jest.fn(async () => ({
        _id: 'skill-1',
        version: 4,
        lastImprovementMutation: {
          candidateId: 'other',
          payloadDigest: digest,
          expectedVersion: 3,
        },
      })),
    });

    await expect(
      decideSkillImprovementReview({
        ...context,
        decision: 'approve',
        payloadDigest: digest,
        snapshotDigest: 'snapshot-1',
      }),
    ).rejects.toThrow(/cannot prove/i);
    expect(context.publish).not.toHaveBeenCalled();
    expect(context.recordEvent).not.toHaveBeenCalled();
  });

  it('fails closed when recovery sees a later native version even with a stale matching receipt', async () => {
    const userId = '507f1f77bcf86cd799439011';
    const recoveryEvents = [
      {
        eventId: 'skill-tests:verified:skill:task:call',
        type: 'VERIFIED',
        actor: { type: 'host' },
        data: { payloadDigest: digest, checks: [{ id: 'content', passed: true }] },
      },
      {
        eventId: 'skill-oracle:skill:task:call',
        type: 'VERIFIED',
        actor: { type: 'oracle' },
        data: {
          payloadDigest: digest,
          oracleDecision: 'ACCEPT',
          disposition: 'AUTHORIZATION_REQUIRED',
        },
      },
      {
        eventId: 'skill-review:skill:task:call',
        type: 'APPROVED',
        actor: { id: userId, type: 'human' },
        data: {
          payloadDigest: digest,
          snapshotDigest: 'snapshot-1',
          skillId: 'skill-1',
          expectedVersion: 3,
        },
      },
      {
        eventId: 'skill-authorization:skill:task:call',
        type: 'AUTHORIZED',
        actor: { id: 'librechat:native-skill-authorization', type: 'policy' },
        data: {
          payloadDigest: digest,
          snapshotDigest: 'snapshot-1',
          actorId: userId,
          skillId: 'skill-1',
          expectedVersion: 3,
        },
      },
    ];
    const context = setup({
      listEvents: jest.fn(async () => recoveryEvents),
      getSkillById: jest.fn(async () => ({
        _id: 'skill-1',
        version: 5,
        lastImprovementMutation: {
          candidateId: 'skill:task:call',
          payloadDigest: digest,
          expectedVersion: 3,
        },
      })),
    });

    await expect(
      decideSkillImprovementReview({
        ...context,
        decision: 'approve',
        payloadDigest: digest,
        snapshotDigest: 'snapshot-1',
      }),
    ).rejects.toThrow(/cannot prove/i);
    expect(context.publish).not.toHaveBeenCalled();
    expect(context.recordEvent).not.toHaveBeenCalled();
  });

  it('requires a separately bound Oracle verdict and exact durable diff', async () => {
    const noOracle = setup({
      listEvents: jest.fn(async () => [
        {
          eventId: 'skill-tests:verified:skill:task:call',
          type: 'VERIFIED',
          actor: { type: 'host' },
          data: { payloadDigest: digest, checks: [{ id: 'content', passed: true }] },
        },
      ]),
    });
    await expect(
      decideSkillImprovementReview({
        ...noOracle,
        decision: 'approve',
        payloadDigest: digest,
        snapshotDigest: 'snapshot-1',
      }),
    ).rejects.toThrow(/verified/i);
    const emptyDiff = setup({
      getProposal: jest.fn(async () => ({
        proposal: {
          candidateId: 'skill:task:call',
          traceId: 'trace',
          skillId: 'skill-1',
          payloadDigest: digest,
          update,
          diff: '',
        },
        snapshotDigest: 'snapshot-1',
      })),
    });
    await expect(loadSkillImprovementReview(emptyDiff)).rejects.toThrow(/diff/i);
  });

  it('fails closed on stale payload, absent tests, denial and rejected human review', async () => {
    const stale = setup();
    await expect(
      decideSkillImprovementReview({
        ...stale,
        decision: 'approve',
        payloadDigest: 'other',
        snapshotDigest: 'snapshot-1',
      }),
    ).rejects.toThrow(/digest/i);
    expect(stale.publish).not.toHaveBeenCalled();
    const noTests = setup({ listEvents: jest.fn(async () => []) });
    await expect(
      decideSkillImprovementReview({
        ...noTests,
        decision: 'approve',
        payloadDigest: digest,
        snapshotDigest: 'snapshot-1',
      }),
    ).rejects.toThrow(/verified/i);
    const denied = setup({ canView: jest.fn(async () => false) });
    await expect(loadSkillImprovementReview(denied)).rejects.toThrow(/access/i);
    const reject = setup();
    expect(
      await decideSkillImprovementReview({
        ...reject,
        decision: 'reject',
        payloadDigest: digest,
        snapshotDigest: 'snapshot-1',
      }),
    ).toMatchObject({ status: 'rejected' });
    expect(reject.publish).not.toHaveBeenCalled();
  });
});
