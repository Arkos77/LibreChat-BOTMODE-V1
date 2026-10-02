import type { HydratedDocument, Types } from 'mongoose';

type ImprovementSkillProposalBase = {
  candidateId: string;
  traceId: string;
  taskId: string;
  producerAgentId: string;
  toolCallId: string;
  payloadDigest: string;
  diff: string;
};

export type ImprovementSkillProposalSnapshot =
  | (ImprovementSkillProposalBase & {
      operation?: 'update';
      skillId: string;
      expectedVersion: number;
      update: {
        body: string;
        description: string;
        frontmatter?: Record<string, unknown>;
        alwaysApply?: boolean;
      };
    })
  | (ImprovementSkillProposalBase & {
      operation: 'create';
      create: {
        name: string;
        displayTitle?: string;
        description: string;
        body: string;
        frontmatter?: Record<string, unknown>;
        category?: string;
        alwaysApply?: boolean;
      };
    });

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
