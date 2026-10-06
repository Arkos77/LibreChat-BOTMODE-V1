import {
  CapabilityResourceRegistry,
  type CapabilityResourceDescriptor,
} from '../orchestrator/capabilityRegistry';
import { BUILTIN_EXTENSION_PACKS } from './extensionPacks';

export interface CapabilityDiscoverySeed {
  id: string;
  name: string;
  category:
    | 'api-catalog'
    | 'provider-router'
    | 'hosting'
    | 'software-adapter'
    | 'vertical-reference';
  sourceRef: string;
  status: 'REFERENCE' | 'CANDIDATE';
  capabilities: readonly string[];
}

/** Descriptive seeds only: evaluation and authorization remain host-owned. */
export const CAPABILITY_DISCOVERY_SEEDS: readonly CapabilityDiscoverySeed[] = [
  {
    id: 'seed:paperclip',
    name: 'Agent work management reference',
    category: 'provider-router',
    sourceRef: 'memo:github:paperclipai-paperclip',
    status: 'REFERENCE',
    capabilities: [
      'goal-project-task',
      'agent-delegation',
      'budgets',
      'governance',
      'heartbeat',
      'recovery',
    ],
  },
  {
    id: 'seed:hindsight',
    name: 'Long-term memory reference',
    category: 'provider-router',
    sourceRef: 'memo:github:vectorize-io-hindsight',
    status: 'REFERENCE',
    capabilities: ['memory-retain', 'memory-recall', 'memory-reflect', 'memory-provenance'],
  },
  {
    id: 'seed:voicestudio',
    name: 'Local audio and voice reference',
    category: 'provider-router',
    sourceRef: 'memo:github:debpalash-voicestudio',
    status: 'REFERENCE',
    capabilities: ['audio', 'voice', 'transcription', 'dubbing', 'batch-media'],
  },
  {
    id: 'seed:impeccable',
    name: 'Deterministic UI and artifact QA reference',
    category: 'software-adapter',
    sourceRef: 'memo:github:pbakaus-impeccable',
    status: 'REFERENCE',
    capabilities: ['ui-audit', 'artifact-qa', 'drift-detection', 'validation-hooks'],
  },
  {
    id: 'seed:public-apis',
    name: 'Public APIs catalog',
    category: 'api-catalog',
    sourceRef: 'memo:github:public-apis',
    status: 'REFERENCE',
    capabilities: ['capability-discovery', 'api-discovery'],
  },
  {
    id: 'seed:free-provider-proxy',
    name: 'Multi-provider coding proxy reference',
    category: 'provider-router',
    sourceRef: 'memo:github:alksnd-free-claude-code',
    status: 'REFERENCE',
    capabilities: ['provider-routing', 'coding-agent', 'fallback'],
  },
  {
    id: 'seed:web-hosting-2026',
    name: 'Web hosting opportunity catalog',
    category: 'hosting',
    sourceRef: 'memo:github:awesome-web-hosting-2026',
    status: 'REFERENCE',
    capabilities: ['hosting-discovery', 'deployment-options'],
  },
  {
    id: 'seed:cli-anything',
    name: 'Agent-native software adapter reference',
    category: 'software-adapter',
    sourceRef: 'memo:github:hkuds-cli-anything',
    status: 'REFERENCE',
    capabilities: ['software-adapter', 'structured-cli', 'artifact-verification'],
  },
  {
    id: 'seed:financial-services',
    name: 'Financial services vertical reference',
    category: 'vertical-reference',
    sourceRef: 'memo:github:anthropics-financial-services',
    status: 'REFERENCE',
    capabilities: ['vertical-pack', 'finance'],
  },
  {
    id: 'seed:orcarouter',
    name: 'Adaptive model-routing reference',
    category: 'provider-router',
    sourceRef: 'https://www.orcarouter.ai/',
    status: 'REFERENCE',
    capabilities: ['provider-routing', 'health-scoring', 'routing-receipts', 'cache-awareness'],
  },
  {
    id: 'seed:tinypages',
    name: 'TinyPages marketing MCP candidate',
    category: 'software-adapter',
    sourceRef: 'https://tinypages.co/mcp',
    status: 'CANDIDATE',
    capabilities: [
      'marketing-mcp',
      'landing-pages',
      'products',
      'email-marketing',
      'forms',
      'publishing',
    ],
  },
  {
    id: 'seed:openblueprint',
    name: 'OpenBlueprint hardware-design candidate',
    category: 'software-adapter',
    sourceRef: 'https://github.com/noobianlabs/openblueprint',
    status: 'CANDIDATE',
    capabilities: ['hardware-design', 'bom', 'wiring', 'assembly', 'build-instructions'],
  },
  {
    id: 'seed:drael',
    name: 'Drael OpenAI-compatible provider candidate',
    category: 'provider-router',
    sourceRef: 'https://drael.sh/docs',
    status: 'CANDIDATE',
    capabilities: ['openai-compatible', 'cloud-llm', 'vision', 'provider-manual'],
  },
];

export function createBuiltinExtensionResources(): CapabilityResourceDescriptor[] {
  const extensionResources = BUILTIN_EXTENSION_PACKS.map(
    (pack) =>
      ({
        id: `extension:${pack.id}`,
        kind: pack.kind === 'vertical' ? 'workflow' : 'tool',
        name: pack.name,
        capabilities: [...pack.capabilities],
        executionMode: 'local-runtime' as const,
        enabled: pack.enabled,
        accessMethod: 'governed-extension',
        permission: 'host-policy',
        trustLevel: 'declared',
        legalUsage: 'pending-provider-specific-review',
        provenance: {
          source: pack.evidenceRefs[0],
          verifiedAt: new Date().toISOString(),
          evidenceRef: pack.evidenceRefs[0],
        },
      }) satisfies CapabilityResourceDescriptor,
  );

  return extensionResources;
}

export function createExtensionCapabilityRegistry(): CapabilityResourceRegistry {
  const registry = new CapabilityResourceRegistry();
  for (const resource of createBuiltinExtensionResources()) registry.register(resource);
  return registry;
}
