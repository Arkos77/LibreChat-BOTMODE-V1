import { ACTIVE_PROVIDER_CAPABILITIES, VERIFIED_EXTERNAL_CAPABILITIES, createActivatedCapabilityRegistry, createRuntimeCapabilityCatalog, NATIVE_BOTMODE_CAPABILITIES } from './nativeCapabilities';

describe('native capability activation', () => {
  it('registers only capabilities already exposed by the current LibreChat runtime', () => {
    expect(NATIVE_BOTMODE_CAPABILITIES).toHaveLength(7);
    expect(ACTIVE_PROVIDER_CAPABILITIES).toHaveLength(1);
    expect(VERIFIED_EXTERNAL_CAPABILITIES).toHaveLength(4);
    expect(ACTIVE_PROVIDER_CAPABILITIES[0].providerId).toBe('openrouter');
    expect(NATIVE_BOTMODE_CAPABILITIES.every((resource) => resource.enabled)).toBe(true);
  });

  it('keeps governed extension packs present but disabled', () => {
    const registry = createActivatedCapabilityRegistry();
    expect(registry.list({ enabledOnly: true }).map((item) => item.id)).toEqual([
      'external:elevenlabs',
      'external:firecrawl',
      'external:serper',
      'external:tavily',
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
    expect(catalog.native).toHaveLength(12);
    expect(catalog.extensions).toHaveLength(10);
    expect(catalog.discoverySeeds.length).toBeGreaterThanOrEqual(5);
  });
});
