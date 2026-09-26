import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createImprovementCandidateMethods } from '~/methods/improvementCandidate';
import { createImprovementCandidateModel } from '~/models/improvementCandidate';

const userId = new mongoose.Types.ObjectId();

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    candidateId: 'workflow-step-limit:trace-1',
    target: 'workflow' as const,
    status: 'CANDIDATE' as const,
    title: 'Review workflow after tool call limit',
    summary: 'Review workflow structure before changing bounded execution policy.',
    traceId: 'trace-1',
    traceEventIds: ['step-limit:response-1'],
    signals: {
      observationCount: 1,
      sourceCounts: { host: 1 },
      typeCounts: { OBSERVED: 1 },
      oracle: {
        verified: 0,
        rejected: 0,
        humanReview: 0,
        unknown: 0,
        reasonCodes: {},
      },
    },
    publication: {
      path: 'proposal-only' as const,
      requiresOracle: true as const,
      requiresAuthorization: true as const,
      requiresHumanReview: false,
    },
    createdAt: '2026-09-26T17:00:00.000Z',
    ...overrides,
  };
}

describe('ImprovementCandidate durable store', () => {
  let mongod: MongoMemoryServer;
  let methods: ReturnType<typeof createImprovementCandidateMethods>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    createImprovementCandidateModel(mongoose);
    methods = createImprovementCandidateMethods(mongoose);
  });

  afterEach(async () => {
    const model = mongoose.models.ImprovementCandidate;
    if (model) await model.collection.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('persists an untenanted candidate in the legacy owner scope', async () => {
    const first = await methods.recordImprovementCandidate({
      user: userId,
      conversationId: 'conversation-legacy',
      candidate: candidate(),
    });
    const replay = await methods.recordImprovementCandidate({
      user: userId,
      conversationId: 'conversation-legacy',
      candidate: candidate(),
    });

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(first.record.tenantId).toBeUndefined();
    expect(first.record.tenantKey).toBe('');

    await expect(
      methods.getImprovementCandidate({
        user: userId,
        candidateId: candidate().candidateId,
      }),
    ).resolves.toMatchObject({
      tenantKey: '',
      conversationId: 'conversation-legacy',
    });
  });

  it('persists an immutable owner-scoped candidate and replays the exact same snapshot idempotently', async () => {
    const input = {
      user: userId,
      tenantId: 'tenant-1',
      conversationId: 'conversation-1',
      candidate: candidate(),
    };

    const first = await methods.recordImprovementCandidate(input);
    const replay = await methods.recordImprovementCandidate(input);

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.record.candidateId).toBe('workflow-step-limit:trace-1');
    expect(replay.record.traceId).toBe('trace-1');
    expect(replay.record.user.toString()).toBe(userId.toString());
    expect(replay.record.tenantId).toBe('tenant-1');
    expect(replay.record.conversationId).toBe('conversation-1');
    expect(await mongoose.models.ImprovementCandidate.countDocuments({})).toBe(1);
  });

  it('fails closed when the same owner and candidateId are replayed with different candidate content', async () => {
    const input = {
      user: userId,
      tenantId: 'tenant-1',
      conversationId: 'conversation-1',
      candidate: candidate(),
    };
    await methods.recordImprovementCandidate(input);

    await expect(
      methods.recordImprovementCandidate({
        ...input,
        candidate: candidate({ summary: 'Different durable snapshot must conflict.' }),
      }),
    ).rejects.toThrow('Improvement candidate idempotency conflict');
    expect(await mongoose.models.ImprovementCandidate.countDocuments({})).toBe(1);
  });

  it('rejects structurally invalid candidate snapshots at the durable boundary', async () => {
    await expect(
      methods.recordImprovementCandidate({
        user: userId,
        tenantId: 'tenant-1',
        conversationId: 'conversation-1',
        candidate: candidate({
          publication: {
            path: 'proposal-only',
            requiresOracle: true,
            requiresAuthorization: false,
            requiresHumanReview: false,
          },
        }) as never,
      }),
    ).rejects.toThrow('Improvement candidate durable publication is invalid');

    await expect(
      methods.recordImprovementCandidate({
        user: userId,
        tenantId: 'tenant-1',
        conversationId: 'conversation-1',
        candidate: candidate({ traceEventIds: [] }),
      }),
    ).rejects.toThrow('Improvement candidate durable traceEventIds must be non-empty');

    expect(await mongoose.models.ImprovementCandidate.countDocuments({})).toBe(0);
  });

  it('rejects direct mutation and deletion of durable candidate snapshots', async () => {
    await methods.recordImprovementCandidate({
      user: userId,
      tenantId: 'tenant-1',
      conversationId: 'conversation-1',
      candidate: candidate(),
    });

    const model = mongoose.models.ImprovementCandidate;
    await expect(
      model.updateOne(
        { candidateId: 'workflow-step-limit:trace-1' },
        { $set: { summary: 'mutated' } },
      ),
    ).rejects.toThrow('ImprovementCandidate snapshots are immutable');
    await expect(model.deleteOne({ candidateId: 'workflow-step-limit:trace-1' })).rejects.toThrow(
      'ImprovementCandidate snapshots are immutable',
    );

    const persisted = await model.findOne({ candidateId: 'workflow-step-limit:trace-1' }).lean();
    expect(persisted?.summary).toBe(
      'Review workflow structure before changing bounded execution policy.',
    );
  });

  it('does not expose a candidate across owner or tenant boundaries', async () => {
    await methods.recordImprovementCandidate({
      user: userId,
      tenantId: 'tenant-1',
      conversationId: 'conversation-1',
      candidate: candidate(),
    });

    const sameOwner = await methods.getImprovementCandidate({
      user: userId,
      tenantId: 'tenant-1',
      candidateId: 'workflow-step-limit:trace-1',
    });
    const otherTenant = await methods.getImprovementCandidate({
      user: userId,
      tenantId: 'tenant-2',
      candidateId: 'workflow-step-limit:trace-1',
    });
    const otherUser = await methods.getImprovementCandidate({
      user: new mongoose.Types.ObjectId(),
      tenantId: 'tenant-1',
      candidateId: 'workflow-step-limit:trace-1',
    });

    expect(sameOwner?.candidateId).toBe('workflow-step-limit:trace-1');
    expect(otherTenant).toBeNull();
    expect(otherUser).toBeNull();
  });
});
