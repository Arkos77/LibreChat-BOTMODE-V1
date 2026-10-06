import type { CapabilityResourceDescriptor } from './capabilityRegistry';
import type { AuthorizedResourceCandidate } from './routing';
import { resolveRegisteredResources, routeRegisteredCapability } from './capabilityRegistryRouting';
import { CapabilityResourceRegistry } from './capabilityRegistry';

const descriptor = (
  id: string,
  overrides: Partial<CapabilityResourceDescriptor> = {},
): CapabilityResourceDescriptor => ({
  id,
  kind: 'tool',
  name: id,
  capabilities: ['research'],
  executionMode: 'tool',
  enabled: true,
  ...overrides,
});

const candidate = (id: string): AuthorizedResourceCandidate => ({
  id,
  capabilities: ['research'],
  executionMode: 'tool',
  signals: { available: true },
});

describe('resolveRegisteredResources', () => {
  it('passes only registry-selected descriptors to the host resolver', async () => {
    const registry = new CapabilityResourceRegistry();
    registry.register(descriptor('a'));
    registry.register(descriptor('b', { enabled: false }));
    const seen: string[] = [];

    const resolved = await resolveRegisteredResources({
      registry,
      query: { enabledOnly: true },
      resolve: (item) => {
        seen.push(item.id);
        return candidate(item.id);
      },
    });

    expect(seen).toEqual(['a']);
    expect(resolved).toEqual([candidate('a')]);
  });

  it('never treats a descriptor as authorized when the host resolver abstains', async () => {
    const registry = new CapabilityResourceRegistry();
    registry.register(descriptor('a'));
    const resolved = await resolveRegisteredResources({
      registry,
      resolve: () => undefined,
    });
    expect(resolved).toEqual([]);
  });

  it('propagates only host-resolved routing metadata', async () => {
    const registry = new CapabilityResourceRegistry();
    registry.register(
      descriptor('a', {
        providerId: 'unresolved-provider',
        modelId: 'unresolved-model',
        permission: 'must-not-be-copied-into-routing',
        trustLevel: 'candidate',
      }),
    );

    const resolved = await resolveRegisteredResources({
      registry,
      resolve: (item) => candidate(item.id),
    });

    expect(resolved).toEqual([candidate('a')]);
    expect(resolved[0]).not.toHaveProperty('permission');
    expect(resolved[0]).not.toHaveProperty('trustLevel');
  });

  it('fails closed on a host resolver identity collision', async () => {
    const registry = new CapabilityResourceRegistry();
    registry.register(descriptor('a'));
    registry.register(descriptor('b'));

    await expect(
      resolveRegisteredResources({
        registry,
        resolve: () => candidate('same'),
      }),
    ).rejects.toThrow('Resolved resource candidate identity collision: same');
  });

  it('does not create an authorization path inside the registry', async () => {
    const registry = new CapabilityResourceRegistry();
    registry.register(descriptor('a'));

    const resolve = jest.fn(async () => undefined);
    await resolveRegisteredResources({ registry, resolve });

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(registry.get('a')?.enabled).toBe(true);
  });

  it('routes an authorized capability through the existing generic ranking policy', async () => {
    const registry = new CapabilityResourceRegistry();
    registry.register(
      descriptor('paid-best', {
        capabilities: ['video.generate'],
        executionMode: 'external-provider',
        signals: { available: true, pricingTier: 'paid', qualityScore: 1 },
      }),
    );
    registry.register(
      descriptor('free-fast', {
        capabilities: ['video.generate'],
        executionMode: 'external-provider',
        signals: {
          available: true,
          pricingTier: 'free',
          qualityScore: 0.8,
          latencyMs: 100,
        },
      }),
    );
    registry.register(
      descriptor('free-slower', {
        capabilities: ['video.generate'],
        executionMode: 'external-provider',
        signals: {
          available: true,
          pricingTier: 'free',
          qualityScore: 0.6,
          latencyMs: 500,
        },
      }),
    );

    const result = await routeRegisteredCapability({
      registry,
      capability: 'video.generate',
      constraints: { spendingPolicy: 'free_first' },
      resolve: (item) => ({
        id: item.id,
        capabilities: [...item.capabilities],
        executionMode: item.executionMode,
        signals: item.signals ? { ...item.signals } : undefined,
      }),
    });

    expect(result.selectedCandidateId).toBe('free-fast');
    expect(result.orderedCandidateIds).toEqual(['free-fast', 'free-slower', 'paid-best']);
    expect(result.fallbackCandidateIds).toEqual(['free-slower', 'paid-best']);
  });

  it('fails closed when no host-authorized resource provides the capability', async () => {
    const registry = new CapabilityResourceRegistry();
    registry.register(
      descriptor('video', {
        capabilities: ['video.generate'],
        executionMode: 'external-provider',
      }),
    );

    await expect(
      routeRegisteredCapability({
        registry,
        capability: 'video.generate',
        resolve: () => undefined,
      }),
    ).rejects.toThrow('No authorized resources provide capability: video.generate');
  });
  it('keeps disabled hardware design candidates fail-closed until the host activates and resolves one', async () => {
    const registry = new CapabilityResourceRegistry();
    registry.register(
      descriptor('hardware-template', {
        capabilities: ['hardware.design', 'hardware.bom'],
        executionMode: 'local-runtime',
        enabled: false,
      }),
    );

    const resolve = jest.fn(() => ({
      id: 'hardware-template',
      capabilities: ['hardware.design', 'hardware.bom'],
      executionMode: 'local-runtime' as const,
      signals: { available: true },
    }));

    await expect(
      routeRegisteredCapability({
        registry,
        capability: 'hardware.design',
        resolve,
      }),
    ).rejects.toThrow('No authorized resources provide capability: hardware.design');
    expect(resolve).not.toHaveBeenCalled();
  });
});
