import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  createImprovementLifecycleEventMethods,
  ImprovementLifecycleEventConflictError,
} from './improvementLifecycleEvent';
import { createModels } from '~/models';

const USER_A = new mongoose.Types.ObjectId();
const USER_B = new mongoose.Types.ObjectId();

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

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    createModels(mongoose);
    methods = createImprovementLifecycleEventMethods(mongoose);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await mongoose.connection.collection('improvementlifecycleevents').deleteMany({});
  });

  it('records an immutable owner-scoped lifecycle event and replays the exact write', async () => {
    const first = await methods.recordImprovementLifecycleEvent({
      user: USER_A,
      tenantId: 'tenant-a',
      event: event(),
    });
    const replay = await methods.recordImprovementLifecycleEvent({
      user: USER_A,
      tenantId: 'tenant-a',
      event: event(),
    });

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.record.eventId).toBe('event-1');
    expect(replay.record.candidateId).toBe('candidate-1');
    expect(replay.record.eventDigest).toBe(first.record.eventDigest);
  });

  it('rejects reuse of one event id with different content', async () => {
    await methods.recordImprovementLifecycleEvent({ user: USER_A, event: event() });

    await expect(
      methods.recordImprovementLifecycleEvent({
        user: USER_A,
        event: event({ type: 'REJECTED', data: { reasonCode: 'oracle-rejected' } }),
      }),
    ).rejects.toBeInstanceOf(ImprovementLifecycleEventConflictError);
  });

  it('keeps owner and tenant scopes isolated', async () => {
    await methods.recordImprovementLifecycleEvent({
      user: USER_A,
      tenantId: 'tenant-a',
      event: event(),
    });

    expect(
      await methods.listImprovementLifecycleEvents({
        user: USER_B,
        tenantId: 'tenant-a',
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
      event: event({
        eventId: 'event-2',
        type: 'VERIFIED',
        occurredAt: '2026-09-26T12:02:00.000Z',
      }),
    });
    await methods.recordImprovementLifecycleEvent({
      user: USER_A,
      event: event({
        eventId: 'event-1',
        type: 'VALIDATING',
        occurredAt: '2026-09-26T12:01:00.000Z',
      }),
    });

    const rows = await methods.listImprovementLifecycleEvents({
      user: USER_A,
      candidateId: 'candidate-1',
    });
    expect(rows.map((row) => row.eventId)).toEqual(['event-1', 'event-2']);
  });

  it('blocks mutation and deletion paths', async () => {
    await methods.recordImprovementLifecycleEvent({ user: USER_A, event: event() });
    const Model = mongoose.models.ImprovementLifecycleEvent;

    await expect(
      Model.updateOne({ eventId: 'event-1' }, { $set: { type: 'COMMITTED' } }),
    ).rejects.toThrow(/immutable|append-only/i);
    await expect(Model.deleteOne({ eventId: 'event-1' })).rejects.toThrow(/immutable|append-only/i);
  });
});
