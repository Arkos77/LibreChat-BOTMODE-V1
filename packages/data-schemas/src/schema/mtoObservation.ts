import { Schema } from 'mongoose';
import type { IMtoObservationRecord } from '~/types/mtoObservation';

const mtoObservationSchema: Schema<IMtoObservationRecord> = new Schema<IMtoObservationRecord>(
  {
    user: { type: Schema.Types.ObjectId, required: true, index: true },
    tenantId: { type: String },
    tenantKey: { type: String, default: '' },
    traceId: { type: String, required: true },
    traceEventId: { type: String, required: true },
    type: {
      type: String,
      enum: ['DECIDED', 'AUTHORIZED', 'DENIED', 'HUMAN_APPROVAL_REQUIRED'],
      required: true,
    },
    source: { type: String, enum: ['host'], required: true },
    timestamp: { type: String, required: true },
    identity: {
      parentTraceEventId: { type: String },
      causedByTraceEventId: { type: String },
      rootRunId: { type: String },
      parentRunId: { type: String },
      subagentRunId: { type: String },
      parentAgentId: { type: String },
      memberAgentId: { type: String },
      parentToolCallId: { type: String },
      taskId: { type: String },
      runId: { type: String },
      threadId: { type: String },
      agentId: { type: String },
    },
    payload: { type: Schema.Types.Mixed, required: true },
    eventDigest: { type: String, required: true },
    persistedAt: { type: Date, required: true, default: Date.now },
  },
  { strict: true },
);

const APPEND_ONLY = 'MtoObservation records are immutable append-only events';
mtoObservationSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne'],
  function (next) {
    next(new Error(APPEND_ONLY));
  },
);
mtoObservationSchema.pre(['deleteOne', 'deleteMany', 'findOneAndDelete'], function (next) {
  next(new Error(APPEND_ONLY));
});
mtoObservationSchema.pre('deleteOne', { document: true, query: false }, function (next) {
  next(new Error(APPEND_ONLY));
});
mtoObservationSchema.pre('updateOne', { document: true, query: false }, function (next) {
  next(new Error(APPEND_ONLY));
});
mtoObservationSchema.pre('save', function (next) {
  if (!this.isNew) {
    next(new Error(APPEND_ONLY));
    return;
  }
  next();
});
mtoObservationSchema.pre('bulkWrite', function (next) {
  next(new Error(APPEND_ONLY));
});
mtoObservationSchema.pre('insertMany', function (next) {
  next(new Error(APPEND_ONLY));
});
mtoObservationSchema.index(
  { user: 1, tenantKey: 1, traceId: 1, traceEventId: 1 },
  { unique: true, name: 'mto_owner_trace_event_idempotency' },
);
mtoObservationSchema.index(
  { user: 1, tenantKey: 1, traceId: 1, timestamp: 1, traceEventId: 1 },
  { name: 'mto_owner_trace_order' },
);
export default mtoObservationSchema;
