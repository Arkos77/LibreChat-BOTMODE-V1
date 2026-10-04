import type {
  CapabilityResourceDescriptor,
  CapabilityResourceRegistry,
} from './capabilityRegistry';

export type ModelWatchStatus = 'ACTIVE' | 'STALE' | 'DEPRECATED' | 'RETIRED';

export interface ModelWatchObservation {
  resourceId: string;
  providerId: string;
  modelId: string;
  checkedAt: string;
  available: boolean;
  status?: ModelWatchStatus;
  replacementModelId?: string;
  sourceRef: string;
  evidenceRef?: string;
}

export interface ModelWatchUpdate {
  resourceId: string;
  status: ModelWatchStatus;
  available: boolean;
  replacementModelId?: string;
}

const VALID_STATUSES = new Set<ModelWatchStatus>(['ACTIVE', 'STALE', 'DEPRECATED', 'RETIRED']);

function assertObservation(observation: ModelWatchObservation): void {
  if (!observation.resourceId || !observation.providerId || !observation.modelId) {
    throw new Error('Model watch observation requires resource, provider and model identities');
  }
  if (!Number.isFinite(Date.parse(observation.checkedAt))) {
    throw new Error('Model watch observation checkedAt must be a valid date');
  }
  if (!observation.sourceRef?.trim()) {
    throw new Error('Model watch observation sourceRef is required');
  }
  if (observation.status != null && !VALID_STATUSES.has(observation.status)) {
    throw new Error(`Unsupported model watch status: ${observation.status}`);
  }
  if (observation.replacementModelId === observation.modelId) {
    throw new Error('Model watch replacement must differ from the observed model');
  }
}

function deriveStatus(observation: ModelWatchObservation): ModelWatchStatus {
  if (observation.status) return observation.status;
  return observation.available ? 'ACTIVE' : 'RETIRED';
}

function updateDescriptor(
  descriptor: CapabilityResourceDescriptor,
  observation: ModelWatchObservation,
): CapabilityResourceDescriptor {
  const status = deriveStatus(observation);
  return {
    ...descriptor,
    enabled: descriptor.enabled && status !== 'RETIRED',
    signals: {
      ...(descriptor.signals ?? {}),
      available: observation.available,
      freshness: status,
    },
    provenance: {
      source: observation.sourceRef,
      verifiedAt: observation.checkedAt,
      ...(observation.evidenceRef ? { evidenceRef: observation.evidenceRef } : {}),
    },
  };
}

/**
 * Applies bounded host observations to the existing capability registry.
 * Discovery, network access, authorization and scheduling remain outside this module.
 */
export function applyModelWatchObservations(
  registry: CapabilityResourceRegistry,
  observations: readonly ModelWatchObservation[],
): ModelWatchUpdate[] {
  if (observations.length > 100) {
    throw new Error('Model watch observation limit exceeded');
  }

  const updates: ModelWatchUpdate[] = [];
  for (const observation of observations) {
    assertObservation(observation);
    const descriptor = registry.get(observation.resourceId);
    if (!descriptor) continue;

    const status = deriveStatus(observation);
    const updated = updateDescriptor(descriptor, observation);
    registry.upsert(updated);
    updates.push({
      resourceId: observation.resourceId,
      status,
      available: observation.available,
      ...(observation.replacementModelId
        ? { replacementModelId: observation.replacementModelId }
        : {}),
    });
  }
  return updates;
}

export function createModelWatchSourceRef(
  providerId: string,
  modelId: string,
  checkedAt: string,
): string {
  return `watch:${providerId}:${modelId}:${checkedAt}`;
}
