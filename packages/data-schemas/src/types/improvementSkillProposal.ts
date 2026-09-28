import type { HydratedDocument, Types } from 'mongoose';

export interface ImprovementSkillProposalSnapshot {
  candidateId: string;
  traceId: string;
  taskId: string;
  producerAgentId: string;
  toolCallId: string;
  skillId: string;
  expectedVersion: number;
  payloadDigest: string;
  diff: string;
  update: {
    body: string;
    description: string;
    frontmatter?: Record<string, unknown>;
    alwaysApply?: boolean;
  };
}

export interface IImprovementSkillProposalRecord {
  user: Types.ObjectId;
  tenantId?: string;
  tenantKey: string;
  conversationId: string;
  proposal: ImprovementSkillProposalSnapshot;
  snapshotDigest: string;
  dedupeKey?: string;
  persistedAt: Date;
}
export type IImprovementSkillProposalDocument = HydratedDocument<IImprovementSkillProposalRecord>;
export interface RecordImprovementSkillProposalInput {
  user: Types.ObjectId | string;
  tenantId?: string;
  conversationId: string;
  proposal: ImprovementSkillProposalSnapshot;
}
export interface GetImprovementSkillProposalInput {
  user: Types.ObjectId | string;
  tenantId?: string;
  candidateId: string;
}
