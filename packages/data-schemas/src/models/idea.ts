import type { Model } from 'mongoose';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import type { IIdeaDocument } from '~/types';
import ideaSchema from '~/schema/idea';
export function createIdeaModel(mongoose: typeof import('mongoose')): Model<IIdeaDocument> {
  applyTenantIsolation(ideaSchema);
  return mongoose.models.Idea || mongoose.model<IIdeaDocument>('Idea', ideaSchema, 'ideas');
}
