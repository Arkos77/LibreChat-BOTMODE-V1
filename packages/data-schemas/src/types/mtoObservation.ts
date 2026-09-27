import type { HydratedDocument, Types } from 'mongoose';

export type DurableMtoType = 'DECIDED' | 'AUTHORIZED' | 'DENIED' | 'HUMAN_APPROVAL_REQUIRED';
export interface MtoObservationIdentity {
  parentTraceEventId?: string;
  causedByTraceEventId?: string;
  taskId?: string;
  rootRunId?: string;
  parentRunId?: string;
  runId?: string;
  subagentRunId?: string;
  threadId?: string;
  agentId?: string;
  parentAgentId?: string;
  memberAgentId?: string;
  parentToolCallId?: string;
}
export interface MtoObservationSnapshot {
  traceId: string;
  traceEventId: string;
  type: DurableMtoType;
  source: 'host';
  timestamp: string;
  identity?: MtoObservationIdentity;
  payload: Record<string, string | number>;
}
export interface IMtoObservationRecord extends MtoObservationSnapshot {
  user: Types.ObjectId;
  tenantId?: string;
  tenantKey: string;
  eventDigest: string;
  persistedAt: Date;
}
export type IMtoObservationDocument = HydratedDocument<IMtoObservationRecord>;
export interface RecordMtoObservationInput {
  user: Types.ObjectId | string;
  tenantId?: string;
  event: MtoObservationSnapshot;
}
export interface ListMtoObservationsInput {
  user: Types.ObjectId | string;
  tenantId?: string;
  traceId: string;
  limit?: number;
  after?: { timestamp: string; traceEventId: string };
}
