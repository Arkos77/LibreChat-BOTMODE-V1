import type { ResourceExecutionMode, AuthorizedResourceSignals } from './routing';

export type RegistryResourceKind =
  | 'agent'
  | 'model'
  | 'tool'
  | 'workflow'
  | 'external-provider'
  | 'local-runtime'
  | 'source';

export interface CapabilityResourceDescriptor {
  id: string;
  kind: RegistryResourceKind;
  name: string;
  capabilities: readonly string[];
  executionMode?: ResourceExecutionMode;
  providerId?: string;
  modelId?: string;
  accessMethod?: string;
  networkRequirement?: string;
  permission?: string;
  trustLevel?: string;
  legalUsage?: string;
  refreshPolicy?: string;
  enabled: boolean;
  toolBinding?: string;
  provenance?: {
    source: string;
    verifiedAt: string;
    evidenceRef?: string;
  };
  signals?: Readonly<AuthorizedResourceSignals>;
}

export interface ResourceRegistryQuery {
  kind?: RegistryResourceKind;
  requiredCapabilities?: readonly string[];
  executionMode?: ResourceExecutionMode;
  enabledOnly?: boolean;
}

function cloneDescriptor(resource: CapabilityResourceDescriptor): CapabilityResourceDescriptor {
  return {
    ...resource,
    capabilities: [...resource.capabilities],
    ...(resource.provenance ? { provenance: { ...resource.provenance } } : {}),
    ...(resource.signals ? { signals: { ...resource.signals } } : {}),
  };
}

function validateDescriptor(resource: CapabilityResourceDescriptor): void {
  if (typeof resource.id !== 'string' || resource.id.trim() === '') {
    throw new Error('Capability resource id is required');
  }
  if (typeof resource.name !== 'string' || resource.name.trim() === '') {
    throw new Error('Capability resource name is required');
  }
  if (!Array.isArray(resource.capabilities) || resource.capabilities.length === 0) {
    throw new Error('Capability resource requires at least one capability');
  }
  if (new Set(resource.capabilities).size !== resource.capabilities.length) {
    throw new Error('Capability resource capabilities must be unique');
  }
  if (typeof resource.enabled !== 'boolean') {
    throw new Error('Capability resource enabled flag is required');
  }
  if (resource.provenance != null) {
    if (
      typeof resource.provenance.source !== 'string' ||
      resource.provenance.source.trim() === '' ||
      typeof resource.provenance.verifiedAt !== 'string' ||
      !Number.isFinite(Date.parse(resource.provenance.verifiedAt))
    ) {
      throw new Error('Capability resource provenance requires source and valid verifiedAt');
    }
  }
}

/**
 * Provider-agnostic descriptive registry. It never authorizes, resolves
 * credentials, reserves budget, executes resources, or becomes durable truth.
 */
export class CapabilityResourceRegistry {
  private readonly resources = new Map<string, CapabilityResourceDescriptor>();

  register(resource: CapabilityResourceDescriptor): void {
    validateDescriptor(resource);
    if (this.resources.has(resource.id)) {
      throw new Error(`Capability resource already registered: ${resource.id}`);
    }
    this.resources.set(resource.id, cloneDescriptor(resource));
  }

  upsert(resource: CapabilityResourceDescriptor): void {
    validateDescriptor(resource);
    this.resources.set(resource.id, cloneDescriptor(resource));
  }

  remove(id: string): boolean {
    return this.resources.delete(id);
  }

  get(id: string): CapabilityResourceDescriptor | undefined {
    const resource = this.resources.get(id);
    return resource ? cloneDescriptor(resource) : undefined;
  }

  list(query: ResourceRegistryQuery = {}): CapabilityResourceDescriptor[] {
    const required = query.requiredCapabilities ?? [];
    return [...this.resources.values()]
      .filter((resource) => query.kind == null || resource.kind === query.kind)
      .filter(
        (resource) => query.executionMode == null || resource.executionMode === query.executionMode,
      )
      .filter((resource) => !query.enabledOnly || resource.enabled)
      .filter((resource) =>
        required.every((capability) => resource.capabilities.includes(capability)),
      )
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(cloneDescriptor);
  }

  size(): number {
    return this.resources.size;
  }
}
