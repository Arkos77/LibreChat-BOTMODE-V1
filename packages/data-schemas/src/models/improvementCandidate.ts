import type { Model } from 'mongoose';
import type { IImprovementCandidateRecord } from '~/types/improvementCandidate';
import improvementCandidateSchema from '~/schema/improvementCandidate';

export function createImprovementCandidateModel(
  mongoose: typeof import('mongoose'),
): Model<IImprovementCandidateRecord> {
  return (
    mongoose.models.ImprovementCandidate ||
    mongoose.model<IImprovementCandidateRecord>('ImprovementCandidate', improvementCandidateSchema)
  );
}
