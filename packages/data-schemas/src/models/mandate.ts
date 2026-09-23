import type { Model } from 'mongoose';
import type { AutonomyMandate } from '~/schema/mandate';
import { applyTenantIsolation } from './plugins/tenantIsolation';
import mandateSchema from '~/schema/mandate';

export function createAutonomyMandateModel(
  mongoose: typeof import('mongoose'),
): Model<AutonomyMandate> {
  applyTenantIsolation(mandateSchema);
  return (
    mongoose.models.AutonomyMandate ||
    mongoose.model<AutonomyMandate>('AutonomyMandate', mandateSchema)
  );
}
