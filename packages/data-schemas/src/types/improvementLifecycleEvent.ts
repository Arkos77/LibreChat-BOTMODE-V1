import type { HydratedDocument, Types } from 'mongoose';

export type ImprovementLifecycleEventType =
  | 'VALIDATING'
  | 'VERIFIED'
  | 'REJECTED'
  | 'UNKNOWN'
  | 'HUMAN_REVIEW'
  | 'AUTHORIZATION_REQUIRED'
  | 'AUTHORIZED'
  | 'DENIED'
  | 'PROPOSAL_ONLY'
  | 'APPROVED'
  | 'ALLOCATED'
  | 'COMMITTED';

export type ImprovementLifecycleActorType = 'host' | 'agent' | 'oracle' | 'policy' | 'human';

export interface ImprovementLifecycleEventSnapshot {
  eventId: string;
  candidateId: string;
  traceId: string;
  type: ImprovementLifecycleEventType;
  actor: {
    id: string;
    type: ImprovementLifecycleActorType;
  };
  data?: Record<string, unknown>;
  occurredAt: string;
}

export interface IImprovementLifecycleEventRecord extends ImprovementLifecycleEventSnapshot {
  user: Types.ObjectId;
  tenantId?: string;
  tenantKey: string;
  eventDigest: string;
  persistedAt: Date;
}

export type IImprovementLifecycleEventDocument = HydratedDocument<IImprovementLifecycleEventRecord>;

export interface RecordImprovementLifecycleEventInput {
  user: Types.ObjectId | string;
  tenantId?: string;
  event: ImprovementLifecycleEventSnapshot;
}

export interface ListImprovementLifecycleEventsInput {
  user: Types.ObjectId | string;
  tenantId?: string;
  candidateId: string;
}
