import { CapabilityResourceRegistry } from './capabilityRegistry';

type CapabilityResourceDescriptor = import('./capabilityRegistry').CapabilityResourceDescriptor;

const resource = (
  overrides: Partial<CapabilityResourceDescriptor> = {},
): CapabilityResourceDescriptor => ({
  id: 'web-search',
  kind: 'tool',
  name: 'Web Search',
  capabilities: ['research', 'search'],
  executionMode: 'tool',
  enabled: true,
  accessMethod: 'mcp',
  networkRequirement: 'WEB',
  permission: 'tool.invoke',
  trustLevel: 'verified',
  legalUsage: 'public-web-only',
  refreshPolicy: 'daily',
  toolBinding: 'web_search',
  provenance: {
    source: 'test',
    verifiedAt: '2026-10-03T00:00:00.000Z',
  },
  signals: {
    available: true,
    qualityScore: 0.8,
    privacy: 'cloud',
  },
  ...overrides,
});

describe('CapabilityResourceRegistry', () => {
  it('registers, snapshots and returns an independent descriptor', () => {
    const registry = new CapabilityResourceRegistry();
    const original = resource();
    registry.register(original);

    const stored = registry.get(original.id);
    expect(stored).toEqual(original);
    expect(stored).not.toBe(original);

    stored!.capabilities.push('mutated');
    stored!.signals!.qualityScore = 0;
    expect(registry.get(original.id)).toEqual(original);
  });

  it('rejects duplicate registration but allows explicit upsert', () => {
    const registry = new CapabilityResourceRegistry();
    registry.register(resource());
    expect(() => registry.register(resource())).toThrow(
      'Capability resource already registered: web-search',
    );

    registry.upsert(resource({ name: 'Updated Web Search' }));
    expect(registry.get('web-search')?.name).toBe('Updated Web Search');
  });

  it('filters by kind, capability, execution mode and enabled state deterministically', () => {
    const registry = new CapabilityResourceRegistry();
    registry.register(resource({ id: 'model-a', kind: 'model', executionMode: 'model' }));
    registry.register(resource({ id: 'disabled', enabled: false }));
    registry.register(resource({ id: 'web-browser', capabilities: ['research', 'browser'] }));

    const filtered = registry.list({
      kind: 'tool',
      requiredCapabilities: ['research', 'search'],
      executionMode: 'tool',
      enabledOnly: true,
    });
    expect(filtered).toEqual([]);

    expect(registry.list({ enabledOnly: true }).map((item) => item.id)).toEqual([
      'model-a',
      'web-browser',
    ]);
    expect(
      registry.list({ requiredCapabilities: ['research', 'browser'] }).map((item) => item.id),
    ).toEqual(['web-browser']);
  });

  it('rejects empty or duplicated capabilities and invalid provenance', () => {
    const registry = new CapabilityResourceRegistry();
    expect(() => registry.register(resource({ capabilities: [] }))).toThrow(
      'Capability resource requires at least one capability',
    );
    expect(() => registry.register(resource({ capabilities: ['research', 'research'] }))).toThrow(
      'Capability resource capabilities must be unique',
    );
    expect(() =>
      registry.register(
        resource({
          provenance: { source: 'test', verifiedAt: 'not-a-date' },
        }),
      ),
    ).toThrow('Capability resource provenance requires source and valid verifiedAt');
  });

  it('removes resources without implying authorization semantics', () => {
    const registry = new CapabilityResourceRegistry();
    registry.register(resource());
    expect(registry.size()).toBe(1);
    expect(registry.remove('web-search')).toBe(true);
    expect(registry.remove('web-search')).toBe(false);
    expect(registry.get('web-search')).toBeUndefined();
  });
});
