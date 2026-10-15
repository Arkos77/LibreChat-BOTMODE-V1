import type { Model } from 'mongoose';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import type { IMtoObservationRecord } from '~/types/mtoObservation';
import mtoObservationSchema from '~/schema/mtoObservation';

export function createMtoObservationModel(
  mongoose: typeof import('mongoose'),
): Model<IMtoObservationRecord> {
  applyTenantIsolation(mtoObservationSchema);
  return (
    mongoose.models.MtoObservation ||
    mongoose.model<IMtoObservationRecord>('MtoObservation', mtoObservationSchema)
  );
}
