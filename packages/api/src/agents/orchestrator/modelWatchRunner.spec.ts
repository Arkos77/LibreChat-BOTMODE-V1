import { CapabilityResourceRegistry } from './capabilityRegistry';
import { ModelWatchRunner } from './modelWatchRunner';

describe('ModelWatchRunner', () => {
  function registry() {
    const value = new CapabilityResourceRegistry();
    value.register({
      id: 'model:test',
      kind: 'model',
      name: 'Test Model',
      capabilities: ['cloud-llm'],
      executionMode: 'model',
      providerId: 'test',
      modelId: 'test-model',
      enabled: true,
    });
    return value;
  }

  it('runs a bounded discovery pass into the existing registry', async () => {
    const value = registry();
    const runner = new ModelWatchRunner(value, () => [
      {
        resourceId: 'model:test',
        providerId: 'test',
        modelId: 'test-model',
        checkedAt: '2026-10-05T10:00:00.000Z',
        available: false,
        status: 'DEPRECATED',
        replacementModelId: 'test-model-v2',
        sourceRef: 'watch:test',
      },
    ]);

    const result = await runner.run();
    expect(result.observations).toBe(1);
    expect(result.updates).toEqual([
      {
        resourceId: 'model:test',
        status: 'DEPRECATED',
        available: false,
        replacementModelId: 'test-model-v2',
      },
    ]);
    expect(value.get('model:test')).toMatchObject({
      enabled: true,
      signals: { available: false, freshness: 'DEPRECATED' },
    });
  });

  it('rejects an oversized discovery batch before mutating the registry', async () => {
    const value = registry();
    const observations = Array.from({ length: 101 }, (_, index) => ({
      resourceId: `missing:${index}`,
      providerId: 'test',
      modelId: `model-${index}`,
      checkedAt: '2026-10-05T10:00:00.000Z',
      available: true,
      sourceRef: 'watch:test',
    }));
    const runner = new ModelWatchRunner(value, () => observations);

    await expect(runner.run()).rejects.toThrow('Model watch discovery limit exceeded');
    expect(value.size()).toBe(1);
  });
});
