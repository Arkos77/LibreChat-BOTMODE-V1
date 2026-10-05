import type { Model } from 'mongoose';
import type { IIdeaDocument } from '~/types';
import ideaSchema from '~/schema/idea';
export function createIdeaModel(mongoose: typeof import('mongoose')): Model<IIdeaDocument> {
  return mongoose.models.Idea || mongoose.model<IIdeaDocument>('Idea', ideaSchema, 'ideas');
}
