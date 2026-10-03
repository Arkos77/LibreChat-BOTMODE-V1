export type ExtensionKind = 'memory' | 'qa' | 'media' | 'vertical' | 'opportunity';

export interface ExtensionPackManifest {
  id: string;
  version: string;
  kind: ExtensionKind;
  name: string;
  description: string;
  capabilities: readonly string[];
  requiredCapabilities?: readonly string[];
  skillIds?: readonly string[];
  toolBindings?: readonly string[];
  evidenceRefs: readonly string[];
  enabled: boolean;
}

export function validateExtensionPack(manifest: ExtensionPackManifest): void {
  if (!manifest.id || !manifest.version || !manifest.name) {
    throw new Error('Extension pack identity is required');
  }
  if (!manifest.description.trim()) {
    throw new Error('Extension pack description is required');
  }
  if (manifest.capabilities.length === 0) {
    throw new Error('Extension pack requires at least one capability');
  }
  if (new Set(manifest.capabilities).size !== manifest.capabilities.length) {
    throw new Error('Extension pack capabilities must be unique');
  }
  if (manifest.evidenceRefs.some((ref) => !ref.trim())) {
    throw new Error('Extension pack evidence refs must be non-empty');
  }
}

export class ExtensionPackRegistry {
  private readonly packs = new Map<string, ExtensionPackManifest>();

  register(pack: ExtensionPackManifest): void {
    validateExtensionPack(pack);
    if (this.packs.has(pack.id)) throw new Error(`Extension pack already registered: ${pack.id}`);
    this.packs.set(pack.id, clone(pack));
  }

  get(id: string): ExtensionPackManifest | undefined {
    const pack = this.packs.get(id);
    return pack == null ? undefined : clone(pack);
  }

  list(kind?: ExtensionKind): ExtensionPackManifest[] {
    return [...this.packs.values()]
      .filter((pack) => kind == null || pack.kind === kind)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(clone);
  }
}

function clone(pack: ExtensionPackManifest): ExtensionPackManifest {
  return {
    ...pack,
    capabilities: [...pack.capabilities],
    ...(pack.requiredCapabilities ? { requiredCapabilities: [...pack.requiredCapabilities] } : {}),
    ...(pack.skillIds ? { skillIds: [...pack.skillIds] } : {}),
    ...(pack.toolBindings ? { toolBindings: [...pack.toolBindings] } : {}),
    evidenceRefs: [...pack.evidenceRefs],
  };
}

export const BUILTIN_EXTENSION_PACKS: readonly ExtensionPackManifest[] = [
  {
    id: 'memory:hindsight',
    version: '1',
    kind: 'memory',
    name: 'Hindsight Memory Lifecycle',
    description: 'Retain, recall and reflect over durable observations without replacing the durable owner.',
    capabilities: ['memory:retain', 'memory:recall', 'memory:reflect', 'memory:provenance'],
    evidenceRefs: ['memo:github:vectorize-io-hindsight'],
    enabled: false,
  },
  {
    id: 'qa:artifact-drift',
    version: '1',
    kind: 'qa',
    name: 'Artifact Drift Audit',
    description: 'Deterministic artifact integrity and field-drift checks feeding the existing Oracle/QA layer.',
    capabilities: ['qa:artifact-audit', 'qa:drift-detection'],
    evidenceRefs: ['memo:github:pbakaus-impeccable'],
    enabled: false,
  },
  {
    id: 'media:audio-voice',
    version: '1',
    kind: 'media',
    name: 'Audio Voice Media',
    description: 'Audio, voice, transcription and dubbing capabilities using the existing governed media router.',
    capabilities: ['media:audio', 'media:voice', 'media:transcription', 'media:dubbing'],
    evidenceRefs: ['memo:github:debpalash-voicestudio'],
    enabled: false,
  },
  {
    id: 'opportunity:economic-enablement',
    version: '1',
    kind: 'opportunity',
    name: 'Economic Enablement',
    description: 'Jobs, product testing, hospitality, sourcing and service opportunities feeding the existing Opportunity contract.',
    capabilities: ['opportunity:jobs', 'opportunity:product-testing', 'opportunity:hospitality', 'opportunity:sourcing'],
    evidenceRefs: ['memo:business:economic-enablement'],
    enabled: false,
  },
  {
    id: 'vertical:finance',
    version: '1',
    kind: 'vertical',
    name: 'Financial Services',
    description: 'Packaging of finance-specific skills and connectors around BOT MODE authorities.',
    capabilities: ['vertical:finance', 'mcp:connectors', 'domain:finance'],
    evidenceRefs: ['memo:github:anthropics-financial-services'],
    enabled: false,
  },
  {
    id: 'vertical:real-estate',
    version: '1',
    kind: 'vertical',
    name: 'Immobilier',
    description: 'Domain pack for property research, qualification and factual analysis.',
    capabilities: ['vertical:real-estate', 'domain:property'],
    evidenceRefs: ['memo:business:real-estate'],
    enabled: false,
  },
  {
    id: 'vertical:pme-procurement',
    version: '1',
    kind: 'vertical',
    name: 'Achats PME',
    description: 'Domain pack for sourcing, supplier comparison and procurement workflows.',
    capabilities: ['vertical:pme-procurement', 'domain:procurement'],
    evidenceRefs: ['memo:business:pme-procurement'],
    enabled: false,
  },
  {
    id: 'vertical:concierge',
    version: '1',
    kind: 'vertical',
    name: 'Conciergerie',
    description: 'Domain pack for concierge and personal-assistant service workflows.',
    capabilities: ['vertical:concierge', 'domain:services'],
    evidenceRefs: ['memo:business:concierge'],
    enabled: false,
  },
  {
    id: 'vertical:automotive',
    version: '1',
    kind: 'vertical',
    name: 'Automobile',
    description: 'Domain pack for automotive asset and vehicle-service workflows.',
    capabilities: ['vertical:automotive', 'domain:automotive'],
    evidenceRefs: ['memo:business:automotive'],
    enabled: false,
  },
  {
    id: 'vertical:hospitality',
    version: '1',
    kind: 'vertical',
    name: 'Hospitality Intelligence',
    description: 'Domain pack for hotel, restaurant, wellness and experience audits.',
    capabilities: ['vertical:hospitality', 'hospitality:rate-parity', 'hospitality:mystery-guest'],
    evidenceRefs: ['memo:opportunity:hospitality'],
    enabled: false,
  },
];
