import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createBudgetReservationMethods } from './reservation';
import { createTransactionMethods } from './transaction';
import { tenantStorage } from '~/config/tenantContext';
import { createBalanceModel } from '~/models/balance';

let server: MongoMemoryServer;
const Balance = createBalanceModel(mongoose);
const scope = { userId: new mongoose.Types.ObjectId().toString(), tenantId: 'tenant' };
beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { dbName: 'p8_budget' });
});
afterAll(async () => {
  await mongoose.disconnect();
  await server?.stop();
});
beforeEach(async () => {
  await Balance.deleteMany({});
});

test('10 credits admits only one of two concurrent reservations of 8', async () => {
  const balance = await Balance.create({
    user: scope.userId,
    tenantId: scope.tenantId,
    tokenCredits: 10,
  });
  const methods = createBudgetReservationMethods(mongoose);
  const results = await Promise.allSettled(
    ['A', 'B'].map((reservationId) =>
      methods.reserveBudget(scope, {
        balanceId: balance.id,
        reservationId,
        runId: 'run',
        capability: 'synthetic',
        amount: 8,
      }),
    ),
  );
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  expect((await Balance.findById(balance.id))!.tokenCredits).toBe(2);
});

const methods = createBudgetReservationMethods(mongoose);
async function fixture(amount = 8, credits = 10) {
  const balance = await Balance.create({
    user: scope.userId,
    tenantId: scope.tenantId,
    tokenCredits: credits,
  });
  const key = { balanceId: balance.id as string, reservationId: 'A', runId: 'run' };
  return { key, request: { ...key, capability: 'synthetic', mandateId: 'mandate', amount } };
}
const current = (id: string) => Balance.findById(id).lean();

test('repeated real Mongo races never admit 16 credits against 10', async () => {
  for (let i = 0; i < 12; i++) {
    const { request, key } = await fixture();
    const result = await Promise.allSettled(
      ['A', 'B'].map((reservationId) =>
        methods.reserveBudget(scope, { ...request, reservationId }),
      ),
    );
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const stored = (await current(key.balanceId))!;
    expect(stored.tokenCredits).toBe(2);
    expect(stored.budgetReservations).toHaveLength(1);
    expect(stored.budgetReservations![0].amount).toBe(8);
  }
});

test('concurrent 6 + 4 admits both and exhausts capacity exactly', async () => {
  const { request, key } = await fixture();
  await Promise.all([
    methods.reserveBudget(scope, { ...request, amount: 6 }),
    methods.reserveBudget(scope, { ...request, reservationId: 'B', amount: 4 }),
  ]);
  const stored = (await current(key.balanceId))!;
  expect(stored.tokenCredits).toBe(0);
  expect(stored.budgetReservations).toHaveLength(2);
  await expect(
    methods.reserveBudget(scope, { ...request, reservationId: 'C', amount: 1 }),
  ).rejects.toThrow('unavailable');
});

test('concurrent 10 + 1 cannot both be admitted', async () => {
  const { request, key } = await fixture();
  const result = await Promise.allSettled(
    [10, 1].map((amount) =>
      methods.reserveBudget(scope, { ...request, reservationId: `call-${amount}`, amount }),
    ),
  );
  expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const stored = (await current(key.balanceId))!;
  expect(stored.budgetReservations).toHaveLength(1);
  expect(stored.tokenCredits + stored.budgetReservations![0].amount).toBe(10);
});

test('concurrent identical identities produce one durable hold and one admission', async () => {
  const { request, key } = await fixture();
  const result = await Promise.all(
    Array.from({ length: 8 }, () => methods.reserveBudget(scope, request)),
  );
  expect(result.filter((r) => r.created)).toHaveLength(1);
  expect(result.every((r) => r.reservation.amount === 8)).toBe(true);
  expect((await current(key.balanceId))!.tokenCredits).toBe(2);
  expect((await current(key.balanceId))!.budgetReservations).toHaveLength(1);
  const reader = createBudgetReservationMethods(mongoose);
  expect(await reader.getBudgetReservation(scope, key)).toMatchObject({
    reservationId: 'A',
    runId: 'run',
    capability: 'synthetic',
    mandateId: 'mandate',
    amount: 8,
    consumed: 0,
    released: 0,
    state: 'reserved',
    createdAt: expect.any(Date),
  });
});

test.each(['consume', 'release'] as const)(
  '%s is idempotent under concurrent settlement, retries and late opposites',
  async (operation) => {
    const { request, key } = await fixture();
    await methods.reserveBudget(scope, request);
    const act = operation === 'consume' ? methods.consumeBudget : methods.releaseBudget;
    const opposite = operation === 'consume' ? methods.releaseBudget : methods.consumeBudget;
    const settled = await Promise.all(Array.from({ length: 8 }, () => act(scope, key)));
    expect(
      settled.every((r) => r.state === (operation === 'consume' ? 'consumed' : 'released')),
    ).toBe(true);
    expect(await act(scope, key)).toEqual(settled[0]);
    await expect(opposite(scope, key)).rejects.toThrow('terminal');
    const retry = await methods.reserveBudget(scope, request);
    expect(retry.created).toBe(false);
    const stored = (await current(key.balanceId))!;
    expect(stored.tokenCredits).toBe(operation === 'consume' ? 2 : 10);
    expect(stored.budgetReservations).toHaveLength(1);
    expect(stored.budgetReservations![0]).toMatchObject({
      consumed: operation === 'consume' ? 8 : 0,
      released: operation === 'release' ? 8 : 0,
      settledAt: expect.any(Date),
    });
  },
);

test('consume racing release produces one terminal state only', async () => {
  const { request, key } = await fixture();
  await methods.reserveBudget(scope, request);
  const result = await Promise.allSettled([
    methods.consumeBudget(scope, key),
    methods.releaseBudget(scope, key),
  ]);
  expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const stored = (await current(key.balanceId))!;
  const reservation = stored.budgetReservations![0];
  expect(reservation.consumed + reservation.released).toBe(8);
  expect(stored.tokenCredits + reservation.consumed).toBe(10);
});

test.each([0, -1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1])(
  'rejects invalid amount %s before mutation',
  async (amount) => {
    const { request, key } = await fixture();
    await expect(methods.reserveBudget(scope, { ...request, amount })).rejects.toThrow();
    expect((await current(key.balanceId))!.tokenCredits).toBe(10);
    expect((await current(key.balanceId))!.budgetReservations).toBeUndefined();
  },
);

test.each([10.5, -1, Number.MAX_SAFE_INTEGER + 1])(
  'does not silently migrate unsupported balance %s',
  async (credits) => {
    const { request, key } = await fixture(1, credits);
    await expect(methods.reserveBudget(scope, request)).rejects.toThrow('unavailable');
    expect((await current(key.balanceId))!.tokenCredits).toBe(credits);
  },
);

test.each([
  { userId: new mongoose.Types.ObjectId().toString(), tenantId: 'tenant' },
  { ...scope, tenantId: 'other' },
  { userId: scope.userId },
])('other owner cannot fetch/reserve/consume/release: %j', async (other) => {
  const { request, key } = await fixture();
  await methods.reserveBudget(scope, request);
  expect(await methods.getBudgetReservation(other, key)).toBeNull();
  await expect(methods.reserveBudget(other, request)).rejects.toThrow();
  await expect(methods.consumeBudget(other, key)).rejects.toThrow();
  await expect(methods.releaseBudget(other, key)).rejects.toThrow();
  expect((await current(key.balanceId))!.tokenCredits).toBe(2);
  expect((await methods.getBudgetReservation(scope, key))!.state).toBe('reserved');
});

test('run ownership and idempotency binding cannot be changed on retry', async () => {
  const { request, key } = await fixture();
  await methods.reserveBudget(scope, request);
  await expect(methods.reserveBudget(scope, { ...request, runId: 'other' })).rejects.toThrow(
    'ownership',
  );
  await expect(methods.consumeBudget(scope, { ...key, runId: 'other' })).rejects.toThrow(
    'ownership',
  );
  await expect(methods.releaseBudget(scope, { ...key, runId: 'other' })).rejects.toThrow(
    'ownership',
  );
  for (const change of [{ amount: 7 }, { capability: 'other' }, { mandateId: 'other' }]) {
    await expect(methods.reserveBudget(scope, { ...request, ...change })).rejects.toThrow(
      'identity',
    );
  }
  expect((await current(key.balanceId))!.tokenCredits).toBe(2);
});

test('rejects malformed identities rather than accepting query operators', async () => {
  const { request, key } = await fixture();
  for (const change of [{ runId: '' }, { reservationId: '$ne' }, { balanceId: 'bad' }]) {
    await expect(methods.reserveBudget(scope, { ...request, ...change })).rejects.toThrow();
  }
  await expect(methods.reserveBudget({ userId: 'bad' }, request)).rejects.toThrow();
  expect((await current(key.balanceId))!.tokenCredits).toBe(10);
});

test('Mongo lookup/update failures propagate without admitting spending', async () => {
  const { request, key } = await fixture();
  const update = jest.spyOn(Balance, 'findOneAndUpdate').mockImplementation(() => {
    throw new Error('DB unavailable');
  });
  await expect(methods.reserveBudget(scope, request)).rejects.toThrow('DB unavailable');
  update.mockRestore();
  expect((await current(key.balanceId))!.tokenCredits).toBe(10);
  await methods.reserveBudget(scope, request);
  const read = jest.spyOn(Balance, 'findOne').mockImplementation(() => {
    throw new Error('DB read unavailable');
  });
  await expect(methods.consumeBudget(scope, key)).rejects.toThrow('DB read unavailable');
  read.mockRestore();
  expect((await methods.getBudgetReservation(scope, key))!.state).toBe('reserved');
});

test('ambient tenant cannot override the explicitly bound owner', async () => {
  const { request, key } = await fixture();
  await expect(
    tenantStorage.run({ tenantId: 'other' }, async () => methods.reserveBudget(scope, request)),
  ).rejects.toThrow('scope');
  await methods.reserveBudget(scope, request);
  await expect(
    tenantStorage.run({ tenantId: 'other' }, async () => methods.releaseBudget(scope, key)),
  ).rejects.toThrow('scope');
  expect((await current(key.balanceId))!.tokenCredits).toBe(2);
});

test('bounded ledger refuses additional holds without losing retry evidence', async () => {
  const { request, key } = await fixture(1, 1000);
  for (let i = 0; i < 256; i++) {
    await methods.reserveBudget(scope, { ...request, reservationId: `call-${i}` });
  }
  await expect(
    methods.reserveBudget(scope, { ...request, reservationId: 'overflow' }),
  ).rejects.toThrow('unavailable');
  expect(
    (await methods.reserveBudget(scope, { ...request, reservationId: 'call-0' })).created,
  ).toBe(false);
  await methods.releaseBudget(scope, { ...key, reservationId: 'call-0' });
  const stored = (await current(key.balanceId))!;
  expect(stored.tokenCredits).toBe(745);
  expect(stored.budgetReservations).toHaveLength(256);
});

test('refund cannot overflow or silently round native credits', async () => {
  const { request, key } = await fixture();
  await methods.reserveBudget(scope, request);
  await Balance.updateOne(
    { _id: key.balanceId },
    { $set: { tokenCredits: Number.MAX_SAFE_INTEGER } },
  );
  await expect(methods.releaseBudget(scope, key)).rejects.toThrow('settlement');
  expect((await methods.getBudgetReservation(scope, key))!.state).toBe('reserved');
  expect((await current(key.balanceId))!.tokenCredits).toBe(Number.MAX_SAFE_INTEGER);
});

test('lost reservation reply can be retried after process reconstruction without a second admission', async () => {
  const { request, key } = await fixture();
  await methods.reserveBudget(scope, request);
  const recovered = createBudgetReservationMethods(mongoose);
  expect((await recovered.reserveBudget(scope, request)).created).toBe(false);
  expect((await recovered.getBudgetReservation(scope, key))!.state).toBe('reserved');
  await recovered.releaseBudget(scope, key);
  expect((await current(key.balanceId))!.tokenCredits).toBe(10);
});

test('native legacy debit preserves holds and fractional legacy balances remain usable outside reservations', async () => {
  const { request, key } = await fixture();
  const legacy = createTransactionMethods(mongoose, {
    getMultiplier: () => 1,
    getCacheMultiplier: () => null,
  });
  await tenantStorage.run({ tenantId: scope.tenantId }, async () => {
    await methods.reserveBudget(scope, request);
    await legacy.updateBalance({ user: scope.userId, incrementValue: -1 });
    await methods.consumeBudget(scope, key);
  });
  expect((await current(key.balanceId))!.tokenCredits).toBe(1);
  expect((await methods.getBudgetReservation(scope, key))!.consumed).toBe(8);
  await tenantStorage.run({ tenantId: scope.tenantId }, async () =>
    legacy.updateBalance({ user: scope.userId, incrementValue: -0.25 }),
  );
  expect((await current(key.balanceId))!.tokenCredits).toBe(0.75);
});
