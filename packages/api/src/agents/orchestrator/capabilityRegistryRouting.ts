import type {
  CapabilityResourceDescriptor,
  CapabilityResourceRegistry,
  ResourceRegistryQuery,
} from './capabilityRegistry';
import {
  rankAuthorizedResources,
  type AuthorizedResourceCandidate,
  type DecisionProvider,
  type ResourceRoutingDecision,
  type RoutingConstraints,
} from './routing';

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

export interface RegisteredCapabilityRoutingDecision {
  capability: string;
  selectedCandidateId: string;
  orderedCandidateIds: string[];
  fallbackCandidateIds: string[];
  routing: ResourceRoutingDecision;
}

/**
 * Routes one capability only after every descriptive registry entry has passed
 * through the explicit host resolver. Registry presence never grants access.
 */
export async function routeRegisteredCapability({
  registry,
  capability,
  constraints,
  resolve,
  decisionProvider,
}: {
  registry: CapabilityResourceRegistry;
  capability: string;
  constraints?: Omit<RoutingConstraints, 'requiredCapabilities'>;
  resolve: ResolveRegisteredResource;
  decisionProvider?: DecisionProvider;
}): Promise<RegisteredCapabilityRoutingDecision> {
  const normalizedCapability = capability.trim();
  if (!normalizedCapability) {
    throw new Error('Capability routing requires a capability');
  }

  const candidates = await resolveRegisteredResources({
    registry,
    query: {
      enabledOnly: true,
      requiredCapabilities: [normalizedCapability],
    },
    resolve,
  });

  if (candidates.length === 0) {
    throw new Error('No authorized resources provide capability: ' + normalizedCapability);
  }

  const routing = await rankAuthorizedResources(
    candidates,
    {
      constraints: {
        ...constraints,
        requiredCapabilities: [normalizedCapability],
      },
    },
    decisionProvider,
  );

  return {
    capability: normalizedCapability,
    selectedCandidateId: routing.selectedCandidateId,
    orderedCandidateIds: [...routing.orderedCandidateIds],
    fallbackCandidateIds: routing.orderedCandidateIds.filter(
      (candidateId) => candidateId !== routing.selectedCandidateId,
    ),
    routing,
  };
}
