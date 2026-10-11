import { CapabilityResourceRegistry } from './capabilityRegistry';
import { observeResolvedModelCatalog } from './modelWatchConfig';

describe('observeResolvedModelCatalog', () => {
  it('registers discovered models and marks them active', async () => {
    const registry = new CapabilityResourceRegistry();
    const result = await observeResolvedModelCatalog(registry, {
      checkedAt: '2026-10-05T12:00:00.000Z',
      loadModels: () => ({ openrouter: ['model-a', 'model-b'] }),
    });

    expect(result.discoveredModelIds).toEqual(['model-a', 'model-b']);
    expect(result.retiredResourceIds).toEqual([]);
    expect(registry.get('model:openrouter:model-a')).toMatchObject({
      kind: 'model',
      providerId: 'openrouter',
      modelId: 'model-a',
      enabled: true,
    });
    expect(result.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resourceId: 'model:openrouter:model-a',
          status: 'ACTIVE',
          available: true,
        }),
      ]),
    );
  });

  it('preserves the catalog when discovery unexpectedly returns no models', async () => {
    const registry = new CapabilityResourceRegistry();
    await observeResolvedModelCatalog(registry, {
      sourcePrefix: 'test-watch',
      loadModels: () => ({ openrouter: ['model-a'] }),
    });
    await expect(observeResolvedModelCatalog(registry, {
      sourcePrefix: 'test-watch',
      loadModels: () => ({ openrouter: [] }),
    })).rejects.toThrow('Model discovery returned no usable models');
    expect(registry.get('model:openrouter:model-a')).toMatchObject({
      enabled: true,
      modelId: 'model-a',
    });
  });

  it('detects a model that disappeared from the resolved catalog', async () => {
    const registry = new CapabilityResourceRegistry();
    await observeResolvedModelCatalog(registry, {
      sourcePrefix: 'test-watch',
      loadModels: () => ({ openrouter: ['model-a', 'model-b'] }),
    });

    const result = await observeResolvedModelCatalog(registry, {
      sourcePrefix: 'test-watch',
      checkedAt: '2026-10-05T12:01:00.000Z',
      loadModels: () => ({ openrouter: ['model-a'] }),
    });

    expect(result.retiredResourceIds).toEqual(['model:openrouter:model-b']);
    expect(result.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resourceId: 'model:openrouter:model-b',
          status: 'RETIRED',
          available: false,
        }),
      ]),
    );
  });
});
