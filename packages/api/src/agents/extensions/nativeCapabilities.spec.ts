import { ACTIVE_PROVIDER_CAPABILITIES, createActivatedCapabilityRegistry, createRuntimeCapabilityCatalog, NATIVE_BOTMODE_CAPABILITIES } from './nativeCapabilities';

describe('native capability activation', () => {
  it('registers only capabilities already exposed by the current LibreChat runtime', () => {
    expect(NATIVE_BOTMODE_CAPABILITIES).toHaveLength(7);
    expect(ACTIVE_PROVIDER_CAPABILITIES).toHaveLength(1);
    expect(ACTIVE_PROVIDER_CAPABILITIES[0].providerId).toBe('openrouter');
    expect(NATIVE_BOTMODE_CAPABILITIES.every((resource) => resource.enabled)).toBe(true);
  });

  it('keeps governed extension packs present but disabled', () => {
    const registry = createActivatedCapabilityRegistry();
    expect(registry.list({ enabledOnly: true }).map((item) => item.id)).toEqual([
      'native:artifacts',
      'native:background-tasks',
      'native:execute-code',
      'native:file-search',
      'native:skills',
      'native:subagents',
      'native:web-search',
      'provider:openrouter',
    ]);
    expect(registry.list({ kind: 'tool', enabledOnly: false }).length).toBeGreaterThan(7);
  });

  it('exposes native, extension and discovery views separately', () => {
    const catalog = createRuntimeCapabilityCatalog();
    expect(catalog.native).toHaveLength(8);
    expect(catalog.extensions).toHaveLength(10);
    expect(catalog.discoverySeeds.length).toBeGreaterThanOrEqual(5);
  });
});
