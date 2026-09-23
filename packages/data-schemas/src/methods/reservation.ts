import { z } from 'zod';
import type {
  BudgetOwner,
  BudgetReservationKey,
  BudgetReservationRequest,
  BudgetReservation,
} from '~/schema/reservation';
import type { IBalance } from '~/types';
import { getTenantId, SYSTEM_TENANT_ID } from '~/config/tenantContext';
import { createBalanceModel } from '~/models/balance';

const identity = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_:.-]+$/);
const objectId = z.string().regex(/^[a-f0-9]{24}$/);
const ownerSchema = z.object({ userId: objectId, tenantId: identity.optional() }).strict();
const keySchema = z
  .object({ balanceId: objectId, reservationId: identity, runId: identity })
  .strict();
const requestSchema = keySchema.extend({
  amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  capability: identity,
  mandateId: identity.optional(),
});

export interface BudgetReservationMethods {
  reserveBudget: (
    owner: BudgetOwner,
    request: BudgetReservationRequest,
  ) => Promise<{ reservation: BudgetReservation; created: boolean }>;
  getBudgetReservation: (
    owner: BudgetOwner,
    key: BudgetReservationKey,
  ) => Promise<BudgetReservation | null>;
  consumeBudget: (owner: BudgetOwner, key: BudgetReservationKey) => Promise<BudgetReservation>;
  releaseBudget: (owner: BudgetOwner, key: BudgetReservationKey) => Promise<BudgetReservation>;
}

/** Trusted server API. Whole tokenCredits only; fixed-cost holds share the native Balance document. */
export function createBudgetReservationMethods(
  mongoose: typeof import('mongoose'),
): BudgetReservationMethods {
  const Balance = createBalanceModel(mongoose);
  const filter = (scope: BudgetOwner, key: BudgetReservationKey) => {
    const owner = ownerSchema.parse(scope);
    const tenant = getTenantId();
    if (tenant != null && tenant !== SYSTEM_TENANT_ID && tenant !== owner.tenantId) {
      throw new Error('Budget tenant scope mismatch');
    }
    return {
      _id: key.balanceId,
      user: owner.userId,
      $and: [{ tenantId: owner.tenantId ?? { $exists: false } }],
    };
  };
  const exactCredits = (minimum: number, maximum = Number.MAX_SAFE_INTEGER) => ({
    tokenCredits: { $gte: minimum, $lte: maximum },
    $expr: { $eq: ['$tokenCredits', { $trunc: '$tokenCredits' }] },
  });
  const read = async (scope: BudgetOwner, key: BudgetReservationKey) => {
    const balance = await Balance.findOne(filter(scope, key)).read('primary').lean<IBalance>();
    const entry = balance?.budgetReservations?.find((r) => r.reservationId === key.reservationId);
    if (entry && entry.runId !== key.runId)
      throw new Error('Budget reservation ownership conflict');
    return entry ?? null;
  };
  const getBudgetReservation = async (scope: BudgetOwner, input: BudgetReservationKey) =>
    read(scope, keySchema.parse(input));

  async function reserveBudget(scope: BudgetOwner, input: BudgetReservationRequest) {
    const request = requestSchema.parse(input);
    const reservation: BudgetReservation = {
      reservationId: request.reservationId,
      runId: request.runId,
      amount: request.amount,
      capability: request.capability,
      mandateId: request.mandateId,
      state: 'reserved',
      consumed: 0,
      released: 0,
      createdAt: new Date(),
    };
    const updated = await Balance.findOneAndUpdate(
      {
        ...filter(scope, request),
        ...exactCredits(request.amount),
        'budgetReservations.reservationId': { $ne: request.reservationId },
        'budgetReservations.255': { $exists: false },
      },
      { $inc: { tokenCredits: -request.amount }, $push: { budgetReservations: reservation } },
      { new: true, writeConcern: { w: 'majority' } },
    ).lean<IBalance>();
    if (updated) return { reservation, created: true };
    const existing = await read(scope, request);
    if (!existing) throw new Error('Budget reservation unavailable');
    if (
      existing.amount !== request.amount ||
      existing.capability !== request.capability ||
      existing.mandateId !== request.mandateId
    ) {
      throw new Error('Budget reservation identity conflict');
    }
    return { reservation: existing, created: false };
  }

  async function settle(
    scope: BudgetOwner,
    input: BudgetReservationKey,
    state: 'consumed' | 'released',
  ): Promise<BudgetReservation> {
    const key = keySchema.parse(input);
    const prior = await read(scope, key);
    if (!prior) throw new Error('Budget reservation unavailable');
    if (prior.state === state) return prior;
    if (prior.state !== 'reserved') throw new Error('Budget reservation terminal conflict');
    if (!Number.isSafeInteger(prior.amount) || prior.amount <= 0)
      throw new Error('Invalid reserved amount');
    const updated = await Balance.findOneAndUpdate(
      {
        ...filter(scope, key),
        ...(state === 'released' ? exactCredits(0, Number.MAX_SAFE_INTEGER - prior.amount) : {}),
        budgetReservations: {
          $elemMatch: {
            reservationId: key.reservationId,
            runId: key.runId,
            state: 'reserved',
            amount: prior.amount,
          },
        },
      },
      {
        ...(state === 'released' ? { $inc: { tokenCredits: prior.amount } } : {}),
        $set: {
          'budgetReservations.$.state': state,
          'budgetReservations.$.settledAt': new Date(),
          'budgetReservations.$.consumed': state === 'consumed' ? prior.amount : 0,
          'budgetReservations.$.released': state === 'released' ? prior.amount : 0,
        },
      },
      { new: true, writeConcern: { w: 'majority' } },
    ).lean<IBalance>();
    const result =
      updated?.budgetReservations?.find((r) => r.reservationId === key.reservationId) ??
      (await read(scope, key));
    if (result?.state !== state) throw new Error('Budget reservation settlement conflict');
    return result;
  }
  return {
    reserveBudget,
    getBudgetReservation,
    consumeBudget: (scope: BudgetOwner, key: BudgetReservationKey) =>
      settle(scope, key, 'consumed'),
    releaseBudget: (scope: BudgetOwner, key: BudgetReservationKey) =>
      settle(scope, key, 'released'),
  };
}
