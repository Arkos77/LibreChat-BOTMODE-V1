import type { TModelsConfig } from 'librechat-data-provider';
import type {
  CapabilityResourceDescriptor,
  CapabilityResourceRegistry,
} from './capabilityRegistry';
import type { ModelWatchObservation } from './modelWatch';

export interface ModelWatchConfigSource {
  loadModels: () => Promise<TModelsConfig> | TModelsConfig;
  checkedAt?: string;
  sourcePrefix?: string;
}

export interface ModelWatchConfigResult {
  observations: readonly ModelWatchObservation[];
  discoveredModelIds: readonly string[];
  retiredResourceIds: readonly string[];
}

/**
 * Adapts LibreChat's existing resolved model catalog into BOT MODE watch observations.
 * It does not fetch providers itself, persist state, or authorize a model.
 */
export async function observeResolvedModelCatalog(
  registry: CapabilityResourceRegistry,
  source: ModelWatchConfigSource,
): Promise<ModelWatchConfigResult> {
  const checkedAt = source.checkedAt ?? new Date().toISOString();
  const sourcePrefix = source.sourcePrefix ?? 'librechat:model-catalog';
  const modelsConfig = await source.loadModels();
  const observations: ModelWatchObservation[] = [];
  const discoveredModelIds: string[] = [];
  const seenResourceIds = new Set<string>();

  for (const [providerId, models] of Object.entries(modelsConfig)) {
    if (!Array.isArray(models)) continue;
    for (const modelId of models) {
      if (typeof modelId !== 'string' || modelId.trim() === '') continue;
      const normalizedModelId = modelId.trim();
      const resourceId = `model:${providerId}:${normalizedModelId}`;
      seenResourceIds.add(resourceId);
      discoveredModelIds.push(normalizedModelId);

      const existing = registry.get(resourceId);
      const descriptor: CapabilityResourceDescriptor = existing ?? {
        id: resourceId,
        kind: 'model',
        name: normalizedModelId,
        capabilities: ['cloud-llm'],
        executionMode: 'model',
        providerId,
        modelId: normalizedModelId,
        enabled: true,
        provenance: {
          source: `${sourcePrefix}:${providerId}`,
          verifiedAt: checkedAt,
        },
      };
      if (!existing) registry.register(descriptor);

      observations.push({
        resourceId,
        providerId,
        modelId: normalizedModelId,
        checkedAt,
        available: true,
        status: 'ACTIVE',
        sourceRef: `${sourcePrefix}:${providerId}`,
      });
    }
  }

  const retiredResourceIds: string[] = [];
  for (const resource of registry.list({ kind: 'model' })) {
    if (
      resource.provenance?.source?.startsWith(sourcePrefix) &&
      !seenResourceIds.has(resource.id)
    ) {
      retiredResourceIds.push(resource.id);
      const modelId = resource.modelId ?? resource.name;
      observations.push({
        resourceId: resource.id,
        providerId: resource.providerId ?? 'unknown',
        modelId,
        checkedAt,
        available: false,
        status: 'RETIRED',
        sourceRef: `${sourcePrefix}:${resource.providerId ?? 'unknown'}`,
      });
    }
  }

  return { observations, discoveredModelIds, retiredResourceIds };
}
