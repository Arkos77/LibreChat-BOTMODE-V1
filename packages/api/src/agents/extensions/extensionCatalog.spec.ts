import { CAPABILITY_DISCOVERY_SEEDS, createBuiltinExtensionResources, createExtensionCapabilityRegistry } from './extensionCatalog';

describe('extension capability catalog', () => {
  it('exposes builtin extension packs through the existing capability registry', () => {
    const registry = createExtensionCapabilityRegistry();
    expect(registry.size()).toBe(10);
    expect(registry.list({ enabledOnly: true })).toHaveLength(0);
    expect(registry.list({ requiredCapabilities: ['opportunity:jobs'] })).toHaveLength(1);
  });

  it('keeps discovery seeds descriptive and non-authoritative', () => {
    expect(CAPABILITY_DISCOVERY_SEEDS.length).toBeGreaterThanOrEqual(5);
    expect(CAPABILITY_DISCOVERY_SEEDS.every((seed) => seed.status !== 'CANDIDATE' || seed.capabilities.length > 0)).toBe(true);
  });

  it('creates provenance-bearing resources', () => {
    const resources = createBuiltinExtensionResources();
    expect(resources.every((item) => item.provenance?.source && item.provenance.evidenceRef)).toBe(true);
    expect(resources.every((item) => item.permission === 'host-policy')).toBe(true);
  });
});
