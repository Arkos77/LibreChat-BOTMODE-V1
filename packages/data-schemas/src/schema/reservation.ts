import { Schema } from 'mongoose';

export interface BudgetOwner {
  userId: string;
  tenantId?: string;
}

export interface BudgetReservationKey {
  balanceId: string;
  reservationId: string;
  runId: string;
}

export interface BudgetReservationRequest extends BudgetReservationKey {
  amount: number;
  capability: string;
  mandateId?: string;
}

export interface BudgetReservation {
  reservationId: string;
  runId: string;
  capability: string;
  mandateId?: string;
  amount: number;
  consumed: number;
  released: number;
  state: 'reserved' | 'consumed' | 'released';
  createdAt: Date;
  settledAt?: Date;
}

export const budgetReservationSchema: Schema<BudgetReservation> = new Schema<BudgetReservation>(
  {
    reservationId: { type: String, required: true },
    runId: { type: String, required: true },
    capability: { type: String, required: true },
    mandateId: String,
    amount: { type: Number, required: true },
    consumed: { type: Number, required: true },
    released: { type: Number, required: true },
    state: { type: String, enum: ['reserved', 'consumed', 'released'], required: true },
    createdAt: { type: Date, required: true },
    settledAt: Date,
  },
  { _id: false },
);
