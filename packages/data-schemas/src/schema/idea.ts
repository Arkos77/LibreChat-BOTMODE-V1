import { Schema } from 'mongoose';
import type { IIdeaDocument } from '~/types';
const ideaSchema = new Schema<IIdeaDocument>(
  {
    user: { type: String, required: true, index: true },
    tenantId: { type: String, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    content: { type: String, default: '', maxlength: 10000 },
    status: {
      type: String,
      enum: [
        'new',
        'to_study',
        'in_analysis',
        'solution_proposed',
        'to_develop',
        'in_progress',
        'done',
        'archived',
      ],
      default: 'new',
      index: true,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
      index: true,
    },
    tags: { type: [String], default: [] },
  },
  { timestamps: true },
);
ideaSchema.index({ user: 1, updatedAt: -1, _id: -1 });
export default ideaSchema;
