import type { CapabilityResourceDescriptor } from './capabilityRegistry';
import type { AuthorizedResourceCandidate } from './routing';
import { resolveRegisteredResources } from './capabilityRegistryRouting';
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
});
