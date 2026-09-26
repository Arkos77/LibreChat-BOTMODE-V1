import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  createImprovementLifecycleEventMethods,
  ImprovementLifecycleEventConflictError,
} from './improvementLifecycleEvent';
import { createImprovementCandidateMethods } from './improvementCandidate';
import { createModels } from '~/models';

const USER_A = new mongoose.Types.ObjectId();
const USER_B = new mongoose.Types.ObjectId();
const TENANT = 'tenant-a';

const candidate = () => ({
  candidateId: 'candidate-1',
  target: 'workflow' as const,
  status: 'CANDIDATE' as const,
  title: 'Candidate 1',
  summary: 'Durable candidate used to bind lifecycle events.',
  traceId: 'trace-1',
  traceEventIds: ['trace-event-1'],
  signals: {
    observationCount: 1,
    sourceCounts: { host: 1 },
    typeCounts: { OBSERVED: 1 },
    oracle: { verified: 0, rejected: 0, humanReview: 0, unknown: 0, reasonCodes: {} },
  },
  publication: {
    path: 'proposal-only' as const,
    requiresOracle: true as const,
    requiresAuthorization: true as const,
    requiresHumanReview: false,
  },
  createdAt: '2026-09-26T11:59:00.000Z',
});

const event = (overrides: Record<string, unknown> = {}) => ({
  eventId: 'event-1',
  candidateId: 'candidate-1',
  traceId: 'trace-1',
  type: 'VALIDATING' as const,
  actor: { id: 'bot-mode-distill', type: 'agent' as const },
  data: { taskId: 'task-1' },
  occurredAt: '2026-09-26T12:00:00.000Z',
  ...overrides,
});

describe('ImprovementLifecycleEvent durable append-only store', () => {
  let mongoServer: MongoMemoryServer;
  let methods: ReturnType<typeof createImprovementLifecycleEventMethods>;
  let candidateMethods: ReturnType<typeof createImprovementCandidateMethods>;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    createModels(mongoose);
    methods = createImprovementLifecycleEventMethods(mongoose);
    candidateMethods = createImprovementCandidateMethods(mongoose);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await mongoose.connection.collection('improvementlifecycleevents').deleteMany({});
    await mongoose.connection.collection('improvementcandidates').deleteMany({});
    await candidateMethods.recordImprovementCandidate({
      user: USER_A,
      tenantId: TENANT,
      conversationId: 'conversation-1',
      candidate: candidate(),
    });
  });

  it('records an immutable owner-scoped lifecycle event and replays the exact write', async () => {
    const first = await methods.recordImprovementLifecycleEvent({
      user: USER_A,
      tenantId: TENANT,
      event: event(),
    });
    const replay = await methods.recordImprovementLifecycleEvent({
      user: USER_A,
      tenantId: TENANT,
      event: event(),
    });

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.record.eventId).toBe('event-1');
    expect(replay.record.candidateId).toBe('candidate-1');
    expect(replay.record.eventDigest).toBe(first.record.eventDigest);
  });

  it('rejects reuse of one event id with different content', async () => {
    await methods.recordImprovementLifecycleEvent({
      user: USER_A,
      tenantId: TENANT,
      event: event(),
    });

    await expect(
      methods.recordImprovementLifecycleEvent({
        user: USER_A,
        tenantId: TENANT,
        event: event({ type: 'REJECTED', data: { reasonCode: 'oracle-rejected' } }),
      }),
    ).rejects.toBeInstanceOf(ImprovementLifecycleEventConflictError);
  });

  it('rejects an event when its candidate does not exist in the same owner scope', async () => {
    await expect(
      methods.recordImprovementLifecycleEvent({
        user: USER_B,
        tenantId: TENANT,
        event: event(),
      }),
    ).rejects.toThrow(/candidate.*not found|missing candidate/i);
  });

  it('rejects an event whose trace id does not match the immutable candidate', async () => {
    await expect(
      methods.recordImprovementLifecycleEvent({
        user: USER_A,
        tenantId: TENANT,
        event: event({ traceId: 'trace-other' }),
      }),
    ).rejects.toThrow(/trace.*mismatch|candidate.*trace/i);
  });

  it('keeps owner and tenant scopes isolated', async () => {
    await methods.recordImprovementLifecycleEvent({
      user: USER_A,
      tenantId: TENANT,
      event: event(),
    });

    expect(
      await methods.listImprovementLifecycleEvents({
        user: USER_B,
        tenantId: TENANT,
        candidateId: 'candidate-1',
      }),
    ).toEqual([]);
    expect(
      await methods.listImprovementLifecycleEvents({
        user: USER_A,
        tenantId: 'tenant-b',
        candidateId: 'candidate-1',
      }),
    ).toEqual([]);
  });

  it('lists one candidate lifecycle deterministically in occurredAt order', async () => {
    await methods.recordImprovementLifecycleEvent({
      user: USER_A,
      tenantId: TENANT,
      event: event({
        eventId: 'event-2',
        type: 'VERIFIED',
        occurredAt: '2026-09-26T12:02:00.000Z',
      }),
    });
    await methods.recordImprovementLifecycleEvent({
      user: USER_A,
      tenantId: TENANT,
      event: event({
        eventId: 'event-1',
        type: 'VALIDATING',
        occurredAt: '2026-09-26T12:01:00.000Z',
      }),
    });

    const rows = await methods.listImprovementLifecycleEvents({
      user: USER_A,
      tenantId: TENANT,
      candidateId: 'candidate-1',
    });
    expect(rows.map((row) => row.eventId)).toEqual(['event-1', 'event-2']);
  });

  it('blocks mutation and deletion paths', async () => {
    await methods.recordImprovementLifecycleEvent({
      user: USER_A,
      tenantId: TENANT,
      event: event(),
    });
    const Model = mongoose.models.ImprovementLifecycleEvent;

    await expect(
      Model.updateOne({ eventId: 'event-1' }, { $set: { type: 'COMMITTED' } }),
    ).rejects.toThrow(/immutable|append-only/i);
    await expect(Model.deleteOne({ eventId: 'event-1' })).rejects.toThrow(/immutable|append-only/i);
  });
});
