import { Schema } from 'mongoose';

export interface MandateScope {
  userId: string;
  tenantId?: string;
}

export interface MandateRules {
  allowedCapabilities: string[];
  deniedCapabilities: string[];
  validFrom: Date;
  expiresAt: Date;
  reason: string;
}

export interface MandateRevision extends MandateRules {
  version: number;
  status: 'active' | 'revoked';
  changedBy: string;
  changedAt: Date;
}

export interface AutonomyMandate extends MandateScope {
  _id: string;
  actorId: string;
  conversationId: string;
  version: number;
  revisions: MandateRevision[];
}

const revisionSchema = new Schema<MandateRevision>(
  {
    version: { type: Number, required: true },
    status: { type: String, enum: ['active', 'revoked'], required: true },
    allowedCapabilities: { type: [String], required: true },
    deniedCapabilities: { type: [String], required: true },
    validFrom: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    reason: { type: String, required: true },
    changedBy: { type: String, required: true },
    changedAt: { type: Date, required: true },
  },
  { _id: false },
);

/** Revisions remain in the same atomic document; expiry never relies on TTL deletion. */
const mandateSchema: Schema<AutonomyMandate> = new Schema<AutonomyMandate>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, immutable: true },
    tenantId: { type: String, immutable: true },
    actorId: { type: String, required: true, immutable: true },
    conversationId: { type: String, required: true, immutable: true },
    version: { type: Number, required: true },
    revisions: { type: [revisionSchema], required: true },
  },
  { bufferCommands: false, versionKey: false },
);

export default mandateSchema;
