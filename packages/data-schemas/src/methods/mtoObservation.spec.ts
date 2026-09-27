import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMtoObservationMethods, MtoObservationConflictError } from './mtoObservation';
import { createModels } from '~/models';

const USER_A = new mongoose.Types.ObjectId();
const USER_B = new mongoose.Types.ObjectId();
const event = (overrides: Record<string, unknown> = {}) => ({
  traceId: 'trace-1',
  traceEventId: 'event-1',
  type: 'DECIDED' as const,
  source: 'host' as const,
  timestamp: '2026-09-27T00:00:00.000Z',
  identity: { taskId: 'task-1' },
  payload: { decisionId: 'decision-1', selectedOption: 'model-a', provider: 'Jev' },
  ...overrides,
});

describe('durable MTO observation boundary', () => {
  let mongo: MongoMemoryServer;
  let methods: ReturnType<typeof createMtoObservationMethods>;
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    createModels(mongoose);
    methods = createMtoObservationMethods(mongoose);
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });
  beforeEach(async () => {
    await mongoose.connection.collection('mtoobservations').deleteMany({});
  });

  it('stores one owner-scoped event and replays the exact write', async () => {
    const input = { user: USER_A, tenantId: 'tenant-a', event: event() };
    const first = await methods.recordMtoObservation(input);
    const replay = await methods.recordMtoObservation(input);
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.record.eventDigest).toBe(first.record.eventDigest);
    expect(
      await methods.listMtoObservations({
        user: USER_A,
        tenantId: 'tenant-a',
        traceId: 'trace-1',
        limit: 10,
      }),
    ).toHaveLength(1);
    expect(
      await methods.listMtoObservations({
        user: USER_B,
        tenantId: 'tenant-a',
        traceId: 'trace-1',
        limit: 10,
      }),
    ).toEqual([]);
    expect(
      await methods.listMtoObservations({
        user: USER_A,
        tenantId: 'tenant-b',
        traceId: 'trace-1',
        limit: 10,
      }),
    ).toEqual([]);
  });

  it('rejects conflicting reuse of an event identity', async () => {
    await methods.recordMtoObservation({ user: USER_A, event: event() });
    await expect(
      methods.recordMtoObservation({
        user: USER_A,
        event: event({
          payload: { decisionId: 'decision-2', selectedOption: 'model-a', provider: 'Jev' },
        }),
      }),
    ).rejects.toBeInstanceOf(MtoObservationConflictError);
  });

  it('rejects arbitrary payload fields and non-scalar identity values', async () => {
    await expect(
      methods.recordMtoObservation({
        user: USER_A,
        event: event({
          payload: {
            decisionId: 'decision-1',
            selectedOption: 'model-a',
            provider: 'Jev',
            rawOutput: 'secret',
          },
        }),
      }),
    ).rejects.toThrow(/payload/);
    await expect(
      methods.recordMtoObservation({
        user: USER_A,
        event: event({ identity: { taskId: { raw: 'secret' } } }),
      }),
    ).rejects.toThrow(/identity/);
  });

  it('bounds reads and rejects direct mutation', async () => {
    for (let i = 0; i < 3; i++)
      await methods.recordMtoObservation({
        user: USER_A,
        event: event({ traceEventId: `event-${i}` }),
      });
    expect(
      await methods.listMtoObservations({ user: USER_A, traceId: 'trace-1', limit: 2 }),
    ).toHaveLength(2);
    await expect(
      mongoose.models.MtoObservation.updateOne({ traceId: 'trace-1' }, { type: 'AUTHORIZED' }),
    ).rejects.toThrow(/append-only/);
  });

  it('rejects an invalid tenant rather than changing owner scope', async () => {
    await expect(
      methods.recordMtoObservation({ user: USER_A, tenantId: 42 as never, event: event() }),
    ).rejects.toThrow(/tenantId/);
    await expect(
      methods.listMtoObservations({ user: USER_A, tenantId: ' ', traceId: 'trace-1' }),
    ).rejects.toThrow(/tenantId/);
  });

  it('requires a canonical timestamp for ordered trace reads', async () => {
    await expect(
      methods.recordMtoObservation({ user: USER_A, event: event({ timestamp: '2026-09-27' }) }),
    ).rejects.toThrow(/timestamp/);
  });

  it('preserves causal and native identities without conflating them', async () => {
    const input = event({
      identity: {
        parentTraceEventId: 'parent-1',
        causedByTraceEventId: 'cause-1',
        taskId: 'task-1',
        runId: 'run-1',
      },
    });
    const { record } = await methods.recordMtoObservation({ user: USER_A, event: input });
    expect(record.identity).toMatchObject({
      parentTraceEventId: 'parent-1',
      causedByTraceEventId: 'cause-1',
      taskId: 'task-1',
      runId: 'run-1',
    });
    expect(record.traceEventId).toBe('event-1');
  });

  it('replays concurrent identical writes under the unique index', async () => {
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        methods.recordMtoObservation({ user: USER_A, event: event() }),
      ),
    );
    expect(results.filter((result) => result.replayed === false)).toHaveLength(1);
    expect(await methods.listMtoObservations({ user: USER_A, traceId: 'trace-1' })).toHaveLength(1);
  });

  it('pages through an ordered trace without skipping equal timestamps', async () => {
    for (let i = 0; i < 3; i++) {
      await methods.recordMtoObservation({
        user: USER_A,
        event: event({ traceEventId: `event-${i}` }),
      });
    }
    const first = await methods.listMtoObservations({ user: USER_A, traceId: 'trace-1', limit: 2 });
    const second = await methods.listMtoObservations({
      user: USER_A,
      traceId: 'trace-1',
      limit: 2,
      after: { timestamp: first[1].timestamp, traceEventId: first[1].traceEventId },
    });
    expect(first.map((item) => item.traceEventId)).toEqual(['event-0', 'event-1']);
    expect(second.map((item) => item.traceEventId)).toEqual(['event-2']);
  });

  it('rejects malformed or injected page cursors', async () => {
    const base = { user: USER_A, traceId: 'trace-1' };
    await expect(
      methods.listMtoObservations({
        ...base,
        after: { timestamp: '2026-09-27', traceEventId: 'event-1' },
      }),
    ).rejects.toThrow(/cursor/);
    await expect(
      methods.listMtoObservations({
        ...base,
        after: { timestamp: '2026-09-27T00:00:00.000Z', traceEventId: { $gt: '' } } as never,
      }),
    ).rejects.toThrow(/cursor/);
    await expect(
      methods.listMtoObservations({
        ...base,
        after: {
          timestamp: '2026-09-27T00:00:00.000Z',
          traceEventId: 'event-1',
          operator: '$where',
        } as never,
      }),
    ).rejects.toThrow(/cursor/);
  });
});
