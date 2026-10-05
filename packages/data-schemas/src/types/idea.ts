import type { Document, Types } from 'mongoose';
export type IdeaStatus =
  | 'new'
  | 'to_study'
  | 'in_analysis'
  | 'solution_proposed'
  | 'to_develop'
  | 'in_progress'
  | 'done'
  | 'archived';
export type IdeaPriority = 'low' | 'medium' | 'high' | 'critical';
export interface IIdea {
  _id?: Types.ObjectId;
  user: string;
  tenantId?: string;
  title: string;
  content: string;
  status: IdeaStatus;
  priority: IdeaPriority;
  tags: string[];
  createdAt?: Date;
  updatedAt?: Date;
}
export interface IIdeaDocument extends Omit<IIdea, '_id'>, Document {}
export interface CreateIdeaInput {
  title: string;
  content?: string;
  status?: IdeaStatus;
  priority?: IdeaPriority;
  tags?: string[];
}
export interface UpdateIdeaInput {
  title?: string;
  content?: string;
  status?: IdeaStatus;
  priority?: IdeaPriority;
  tags?: string[];
}
export interface IdeaMethods {
  listIdeas(userId: string): Promise<IIdea[]>;
  getIdea(userId: string, ideaId: string): Promise<IIdea | null>;
  createIdea(userId: string, input: CreateIdeaInput, tenantId?: string): Promise<IIdea>;
  updateIdea(userId: string, ideaId: string, input: UpdateIdeaInput): Promise<IIdea | null>;
  deleteIdea(userId: string, ideaId: string): Promise<boolean>;
}
