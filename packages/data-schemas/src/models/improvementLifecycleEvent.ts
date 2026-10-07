import type { Model } from 'mongoose';
import type { IImprovementLifecycleEventRecord } from '~/types/improvementLifecycleEvent';
import improvementLifecycleEventSchema from '~/schema/improvementLifecycleEvent';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';

export function createImprovementLifecycleEventModel(
  mongoose: typeof import('mongoose'),
): Model<IImprovementLifecycleEventRecord> {
  applyTenantIsolation(improvementLifecycleEventSchema);
  return (
    mongoose.models.ImprovementLifecycleEvent ||
    mongoose.model<IImprovementLifecycleEventRecord>(
      'ImprovementLifecycleEvent',
      improvementLifecycleEventSchema,
    )
  );
}
