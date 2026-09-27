import type { Model } from 'mongoose';
import type { IImprovementSkillProposalRecord } from '~/types/improvementSkillProposal';
import schema from '~/schema/improvementSkillProposal';

export function createImprovementSkillProposalModel(
  mongoose: typeof import('mongoose'),
): Model<IImprovementSkillProposalRecord> {
  return (
    mongoose.models.ImprovementSkillProposal ||
    mongoose.model<IImprovementSkillProposalRecord>('ImprovementSkillProposal', schema)
  );
}
