import type { Model } from 'mongoose';
import type * as t from '~/types';
export function createIdeaMethods(mongoose: typeof import('mongoose')): t.IdeaMethods {
  const I = (): Model<t.IIdeaDocument> => mongoose.models.Idea as Model<t.IIdeaDocument>;
  return {
    listIdeas: (u) => I().find({ user: u }).sort({ updatedAt: -1, _id: -1 }).lean<t.IIdea[]>(),
    getIdea: (u, id) => I().findOne({ _id: id, user: u }).lean<t.IIdea>(),
    createIdea: async (u, i, tenantId) => {
      const d = await I().create({
        user: u,
        tenantId,
        title: i.title,
        content: i.content ?? '',
        status: i.status ?? 'new',
        priority: i.priority ?? 'medium',
        tags: i.tags ?? [],
      });
      return d.toObject<t.IIdea>();
    },
    updateIdea: (u, id, i) =>
      I()
        .findOneAndUpdate({ _id: id, user: u }, { $set: i }, { new: true, runValidators: true })
        .lean<t.IIdea>(),
    deleteIdea: async (u, id) => (await I().deleteOne({ _id: id, user: u })).deletedCount > 0,
  };
}
export type IdeaMethods = ReturnType<typeof createIdeaMethods>;
