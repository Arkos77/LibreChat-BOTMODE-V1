import type { HydratedDocument, Types } from 'mongoose';

export type ImprovementCandidateTarget = 'skill' | 'agent' | 'workflow' | 'specialist';
export type ImprovementCandidatePublicationPath =
  | 'native-skill-authoring-required'
  | 'proposal-only';

export interface ImprovementCandidateSnapshot {
  candidateId: string;
  target: ImprovementCandidateTarget;
  status: 'CANDIDATE';
  title: string;
  summary: string;
  traceId: string;
  traceEventIds: string[];
  payloadDigest?: string;
  signals: {
    observationCount: number;
    sourceCounts: Record<string, number>;
    typeCounts: Record<string, number>;
    oracle: {
      verified: number;
      rejected: number;
      humanReview: number;
      unknown: number;
      reasonCodes: Record<string, number>;
    };
  };
  publication: {
    path: ImprovementCandidatePublicationPath;
    requiresOracle: true;
    requiresAuthorization: true;
    requiresHumanReview: boolean;
  };
  createdAt: string;
}

export interface IImprovementCandidateRecord extends ImprovementCandidateSnapshot {
  user: Types.ObjectId;
  tenantId?: string;
  tenantKey: string;
  conversationId: string;
  snapshotDigest: string;
  persistedAt: Date;
}

export type IImprovementCandidateDocument = HydratedDocument<IImprovementCandidateRecord>;

export interface RecordImprovementCandidateInput {
  user: Types.ObjectId | string;
  tenantId?: string;
  conversationId: string;
  candidate: ImprovementCandidateSnapshot;
}

export interface GetImprovementCandidateInput {
  user: Types.ObjectId | string;
  tenantId?: string;
  candidateId: string;
}
