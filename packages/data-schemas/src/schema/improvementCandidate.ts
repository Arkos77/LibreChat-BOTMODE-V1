import { Schema } from 'mongoose';
import type { IImprovementCandidateRecord } from '~/types/improvementCandidate';

const improvementCandidateSchema: Schema<IImprovementCandidateRecord> =
  new Schema<IImprovementCandidateRecord>(
    {
      user: { type: Schema.Types.ObjectId, required: true, index: true },
      tenantId: { type: String },
      tenantKey: { type: String, default: '' },
      conversationId: { type: String, required: true },
      candidateId: { type: String, required: true },
      target: {
        type: String,
        enum: ['skill', 'agent', 'workflow', 'specialist'],
        required: true,
      },
      status: { type: String, enum: ['CANDIDATE'], required: true },
      title: { type: String, required: true },
      summary: { type: String, required: true },
      traceId: { type: String, required: true },
      traceEventIds: { type: [String], required: true },
      payloadDigest: { type: String },
      signals: { type: Schema.Types.Mixed, required: true },
      publication: { type: Schema.Types.Mixed, required: true },
      createdAt: { type: String, required: true },
      snapshotDigest: { type: String, required: true },
      persistedAt: { type: Date, required: true, default: Date.now },
    },
    { strict: true },
  );

const IMPROVEMENT_CANDIDATE_IMMUTABLE_MESSAGE = 'ImprovementCandidate snapshots are immutable';

improvementCandidateSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne'],
  function (next) {
    next(new Error(IMPROVEMENT_CANDIDATE_IMMUTABLE_MESSAGE));
  },
);

improvementCandidateSchema.pre(['deleteOne', 'deleteMany', 'findOneAndDelete'], function (next) {
  next(new Error(IMPROVEMENT_CANDIDATE_IMMUTABLE_MESSAGE));
});

improvementCandidateSchema.pre('deleteOne', { document: true, query: false }, function (next) {
  next(new Error(IMPROVEMENT_CANDIDATE_IMMUTABLE_MESSAGE));
});

improvementCandidateSchema.pre('updateOne', { document: true, query: false }, function (next) {
  next(new Error(IMPROVEMENT_CANDIDATE_IMMUTABLE_MESSAGE));
});

improvementCandidateSchema.pre('save', function (next) {
  if (!this.isNew) {
    next(new Error(IMPROVEMENT_CANDIDATE_IMMUTABLE_MESSAGE));
    return;
  }
  next();
});

improvementCandidateSchema.pre('bulkWrite', function (next) {
  next(new Error(IMPROVEMENT_CANDIDATE_IMMUTABLE_MESSAGE));
});

improvementCandidateSchema.pre('insertMany', function (next) {
  next(new Error(IMPROVEMENT_CANDIDATE_IMMUTABLE_MESSAGE));
});

improvementCandidateSchema.index(
  { user: 1, tenantKey: 1, candidateId: 1 },
  { unique: true, name: 'improvement_candidate_owner_idempotency' },
);
improvementCandidateSchema.index(
  { user: 1, tenantKey: 1, traceId: 1, persistedAt: -1 },
  { name: 'improvement_candidate_owner_trace' },
);

export default improvementCandidateSchema;
