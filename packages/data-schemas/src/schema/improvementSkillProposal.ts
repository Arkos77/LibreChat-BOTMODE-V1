import { Schema } from 'mongoose';
import type { IImprovementSkillProposalRecord } from '~/types/improvementSkillProposal';

const schema: Schema<IImprovementSkillProposalRecord> = new Schema<IImprovementSkillProposalRecord>(
  {
    user: { type: Schema.Types.ObjectId, required: true },
    tenantId: { type: String },
    tenantKey: { type: String, required: true },
    conversationId: { type: String, required: true },
    proposal: { type: Schema.Types.Mixed, required: true },
    snapshotDigest: { type: String, required: true },
    persistedAt: { type: Date, required: true, default: Date.now },
  },
  { strict: true },
);
const immutable = 'Improvement skill proposals are immutable';
schema.pre(
  [
    'updateOne',
    'updateMany',
    'findOneAndUpdate',
    'findOneAndReplace',
    'replaceOne',
    'deleteOne',
    'deleteMany',
    'findOneAndDelete',
  ],
  function (next) {
    next(new Error(immutable));
  },
);
schema.pre('save', function (next) {
  next(this.isNew ? undefined : new Error(immutable));
});
schema.index(
  { user: 1, tenantKey: 1, 'proposal.candidateId': 1 },
  { unique: true, name: 'improvement_skill_proposal_owner_idempotency' },
);
export default schema;
