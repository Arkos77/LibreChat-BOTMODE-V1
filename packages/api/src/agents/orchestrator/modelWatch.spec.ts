import { applyModelWatchObservations, createModelWatchSourceRef } from './modelWatch';
import { CapabilityResourceRegistry } from './capabilityRegistry';

describe('model watch', () => {
  function registry() {
    const value = new CapabilityResourceRegistry();
    value.register({
      id: 'model:openrouter/free',
      kind: 'model',
      name: 'OpenRouter Free',
      capabilities: ['cloud-llm'],
      executionMode: 'model',
      providerId: 'openrouter',
      modelId: 'openrouter/free',
      enabled: true,
    });
    return value;
  }

  it('marks an observed model active with provenance', () => {
    const checkedAt = '2026-10-05T10:00:00.000Z';
    const sourceRef = createModelWatchSourceRef('openrouter', 'openrouter/free', checkedAt);
    const r = registry();

    const updates = applyModelWatchObservations(r, [
      {
        resourceId: 'model:openrouter/free',
        providerId: 'openrouter',
        modelId: 'openrouter/free',
        checkedAt,
        available: true,
        sourceRef,
        evidenceRef: 'live:test',
      },
    ]);

    expect(updates).toEqual([
      { resourceId: 'model:openrouter/free', status: 'ACTIVE', available: true },
    ]);
    expect(r.get('model:openrouter/free')).toMatchObject({
      signals: { available: true, freshness: 'ACTIVE' },
      provenance: { source: sourceRef, verifiedAt: checkedAt, evidenceRef: 'live:test' },
      enabled: true,
    });
  });

  it('retires an unavailable model and preserves a replacement hint', () => {
    const r = registry();
    const updates = applyModelWatchObservations(r, [
      {
        resourceId: 'model:openrouter/free',
        providerId: 'openrouter',
        modelId: 'openrouter/free',
        checkedAt: '2026-10-05T10:00:00.000Z',
        available: false,
        replacementModelId: 'openrouter/new-free',
        sourceRef: 'live:test',
      },
    ]);

    expect(updates[0]).toMatchObject({
      resourceId: 'model:openrouter/free',
      status: 'RETIRED',
      available: false,
      replacementModelId: 'openrouter/new-free',
    });
    expect(r.get('model:openrouter/free')).toMatchObject({
      enabled: false,
      signals: { available: false, freshness: 'RETIRED' },
    });
  });

  it('rejects missing provenance and self-replacements', () => {
    const r = registry();
    expect(() =>
      applyModelWatchObservations(r, [
        {
          resourceId: 'model:openrouter/free',
          providerId: 'openrouter',
          modelId: 'openrouter/free',
          checkedAt: '2026-10-05T10:00:00.000Z',
          available: true,
          sourceRef: '',
        },
      ]),
    ).toThrow('sourceRef is required');
    expect(() =>
      applyModelWatchObservations(r, [
        {
          resourceId: 'model:openrouter/free',
          providerId: 'openrouter',
          modelId: 'openrouter/free',
          checkedAt: '2026-10-05T10:00:00.000Z',
          available: false,
          replacementModelId: 'openrouter/free',
          sourceRef: 'live:test',
        },
      ]),
    ).toThrow('replacement must differ');
  });
});
