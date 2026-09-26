import { Schema } from 'mongoose';
import type { IImprovementLifecycleEventRecord } from '~/types/improvementLifecycleEvent';

const improvementLifecycleEventSchema: Schema<IImprovementLifecycleEventRecord> =
  new Schema<IImprovementLifecycleEventRecord>(
    {
      user: { type: Schema.Types.ObjectId, required: true, index: true },
      tenantId: { type: String },
      tenantKey: { type: String, default: '' },
      eventId: { type: String, required: true },
      candidateId: { type: String, required: true },
      traceId: { type: String, required: true },
      type: {
        type: String,
        enum: [
          'VALIDATING',
          'VERIFIED',
          'REJECTED',
          'UNKNOWN',
          'HUMAN_REVIEW',
          'AUTHORIZATION_REQUIRED',
          'AUTHORIZED',
          'DENIED',
          'PROPOSAL_ONLY',
          'COMMITTED',
        ],
        required: true,
      },
      actor: {
        id: { type: String, required: true },
        type: {
          type: String,
          enum: ['host', 'agent', 'oracle', 'policy', 'human'],
          required: true,
        },
      },
      data: { type: Schema.Types.Mixed },
      occurredAt: { type: String, required: true },
      eventDigest: { type: String, required: true },
      persistedAt: { type: Date, required: true, default: Date.now },
    },
    { strict: true },
  );

const APPEND_ONLY_MESSAGE = 'ImprovementLifecycleEvent records are immutable append-only events';

improvementLifecycleEventSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne'],
  function (next) {
    next(new Error(APPEND_ONLY_MESSAGE));
  },
);

improvementLifecycleEventSchema.pre(
  ['deleteOne', 'deleteMany', 'findOneAndDelete'],
  function (next) {
    next(new Error(APPEND_ONLY_MESSAGE));
  },
);

improvementLifecycleEventSchema.pre('deleteOne', { document: true, query: false }, function (next) {
  next(new Error(APPEND_ONLY_MESSAGE));
});

improvementLifecycleEventSchema.pre('updateOne', { document: true, query: false }, function (next) {
  next(new Error(APPEND_ONLY_MESSAGE));
});

improvementLifecycleEventSchema.pre('save', function (next) {
  if (!this.isNew) {
    next(new Error(APPEND_ONLY_MESSAGE));
    return;
  }
  next();
});

improvementLifecycleEventSchema.pre('bulkWrite', function (next) {
  next(new Error(APPEND_ONLY_MESSAGE));
});

improvementLifecycleEventSchema.pre('insertMany', function (next) {
  next(new Error(APPEND_ONLY_MESSAGE));
});

improvementLifecycleEventSchema.index(
  { user: 1, tenantKey: 1, candidateId: 1, eventId: 1 },
  { unique: true, name: 'improvement_lifecycle_owner_candidate_event_idempotency' },
);
improvementLifecycleEventSchema.index(
  { user: 1, tenantKey: 1, candidateId: 1, occurredAt: 1, eventId: 1 },
  { name: 'improvement_lifecycle_owner_candidate_order' },
);
improvementLifecycleEventSchema.index(
  { user: 1, tenantKey: 1, traceId: 1, occurredAt: 1 },
  { name: 'improvement_lifecycle_owner_trace' },
);

export default improvementLifecycleEventSchema;
