import type { Model } from 'mongoose';
import type { IMtoObservationRecord } from '~/types/mtoObservation';
import mtoObservationSchema from '~/schema/mtoObservation';

export function createMtoObservationModel(
  mongoose: typeof import('mongoose'),
): Model<IMtoObservationRecord> {
  return (
    mongoose.models.MtoObservation ||
    mongoose.model<IMtoObservationRecord>('MtoObservation', mtoObservationSchema)
  );
}
