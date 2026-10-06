import {
  CAPABILITY_DISCOVERY_SEEDS,
  createBuiltinExtensionResources,
  createExtensionCapabilityRegistry,
} from './extensionCatalog';

describe('extension capability catalog', () => {
  it('exposes builtin extension packs through the existing capability registry', () => {
    const registry = createExtensionCapabilityRegistry();
    expect(registry.size()).toBe(11);
    expect(registry.list({ enabledOnly: true })).toHaveLength(0);
    expect(registry.list({ requiredCapabilities: ['opportunity:jobs'] })).toHaveLength(1);
    expect(registry.list({ requiredCapabilities: ['hardware.design'] })).toEqual([
      expect.objectContaining({
        id: 'extension:hardware:openblueprint',
        enabled: false,
      }),
    ]);
  });

  it('keeps discovery seeds descriptive and non-authoritative', () => {
    expect(CAPABILITY_DISCOVERY_SEEDS.length).toBeGreaterThanOrEqual(5);
    expect(
      CAPABILITY_DISCOVERY_SEEDS.every(
        (seed) => seed.status !== 'CANDIDATE' || seed.capabilities.length > 0,
      ),
    ).toBe(true);
    expect(CAPABILITY_DISCOVERY_SEEDS.find((seed) => seed.id === 'seed:orcarouter')).toMatchObject({
      status: 'REFERENCE',
    });
    for (const id of ['seed:tinypages', 'seed:openblueprint', 'seed:drael']) {
      expect(CAPABILITY_DISCOVERY_SEEDS.find((seed) => seed.id === id)).toMatchObject({
        status: 'CANDIDATE',
      });
    }
  });

  it('creates provenance-bearing resources', () => {
    const resources = createBuiltinExtensionResources();
    expect(resources.every((item) => item.provenance?.source && item.provenance.evidenceRef)).toBe(
      true,
    );
    expect(resources.every((item) => item.permission === 'host-policy')).toBe(true);
  });
});
