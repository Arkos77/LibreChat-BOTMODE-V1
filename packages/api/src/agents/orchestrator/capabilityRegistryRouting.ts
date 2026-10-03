import type {
  CapabilityResourceDescriptor,
  CapabilityResourceRegistry,
  ResourceRegistryQuery,
} from './capabilityRegistry';
import type { AuthorizedResourceCandidate } from './routing';

export type ResolveRegisteredResource = (
  descriptor: CapabilityResourceDescriptor,
) => Promise<AuthorizedResourceCandidate | undefined> | AuthorizedResourceCandidate | undefined;

/**
 * Resolves descriptive registry entries into routing candidates only through
 * an explicit host resolver. The registry itself never grants authorization.
 */
export async function resolveRegisteredResources({
  registry,
  query,
  resolve,
}: {
  registry: CapabilityResourceRegistry;
  query?: ResourceRegistryQuery;
  resolve: ResolveRegisteredResource;
}): Promise<AuthorizedResourceCandidate[]> {
  const descriptors = registry.list(query);
  const resolved: AuthorizedResourceCandidate[] = [];
  const seen = new Set<string>();

  for (const descriptor of descriptors) {
    const candidate = await resolve(descriptor);
    if (candidate == null) continue;
    if (!candidate.id || seen.has(candidate.id)) {
      throw new Error('Resolved resource candidate identity collision: ' + candidate.id);
    }
    seen.add(candidate.id);
    resolved.push(candidate);
  }

  return resolved;
}
