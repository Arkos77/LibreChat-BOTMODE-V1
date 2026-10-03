import { CapabilityResourceRegistry, type CapabilityResourceDescriptor } from '../orchestrator/capabilityRegistry';
import { CAPABILITY_DISCOVERY_SEEDS, createBuiltinExtensionResources } from './extensionCatalog';

export const VERIFIED_EXTERNAL_CAPABILITIES: readonly CapabilityResourceDescriptor[] = [
  {
    id: 'external:serper',
    kind: 'tool', name: 'Serper Search',
    capabilities: ['web-search', 'search-provider'], executionMode: 'tool',
    providerId: 'serper', accessMethod: 'https', networkRequirement: 'internet',
    permission: 'host-policy', trustLevel: 'configured-provider', legalUsage: 'provider-terms-review',
    enabled: true, provenance: { source: 'env:SERPER_API_KEY', verifiedAt: new Date().toISOString() },
  },
  {
    id: 'external:firecrawl',
    kind: 'tool', name: 'Firecrawl Scraper',
    capabilities: ['web-scrape', 'page-fetch'], executionMode: 'tool',
    providerId: 'firecrawl', accessMethod: 'https', networkRequirement: 'internet',
    permission: 'host-policy', trustLevel: 'configured-provider', legalUsage: 'provider-terms-review',
    enabled: true, provenance: { source: 'env:FIRECRAWL_API_KEY', verifiedAt: new Date().toISOString() },
  },
  {
    id: 'external:tavily',
    kind: 'tool', name: 'Tavily Search',
    capabilities: ['web-search', 'search-fallback', 'page-extract'], executionMode: 'tool',
    providerId: 'tavily', accessMethod: 'https', networkRequirement: 'internet',
    permission: 'host-policy', trustLevel: 'configured-provider', legalUsage: 'provider-terms-review',
    enabled: true, provenance: { source: 'env:TAVILY_API_KEY', verifiedAt: new Date().toISOString() },
  },
  {
    id: 'external:elevenlabs',
    kind: 'tool', name: 'ElevenLabs TTS',
    capabilities: ['media:voice', 'media:tts'], executionMode: 'tool',
    providerId: 'elevenlabs', accessMethod: 'https', networkRequirement: 'internet',
    permission: 'host-policy', trustLevel: 'configured-provider', legalUsage: 'provider-terms-review',
    enabled: true, provenance: { source: 'env:ELEVENLABS_API_KEY', verifiedAt: new Date().toISOString() },
  },
];

export const ACTIVE_PROVIDER_CAPABILITIES: readonly CapabilityResourceDescriptor[] = [
  {
    id: 'provider:openrouter',
    kind: 'external-provider',
    name: 'OpenRouter',
    capabilities: ['model-routing', 'provider-fallback', 'cloud-llm'],
    executionMode: 'external-provider',
    providerId: 'openrouter',
    modelId: 'openrouter/free',
    accessMethod: 'openai-compatible',
    networkRequirement: 'internet',
    permission: 'host-policy',
    trustLevel: 'configured-provider',
    legalUsage: 'provider-terms-review',
    refreshPolicy: 'runtime-config',
    enabled: true,
    provenance: { source: 'librechat:env:OPENROUTER_KEY', verifiedAt: new Date().toISOString() },
  },
];

export const NATIVE_BOTMODE_CAPABILITIES: readonly CapabilityResourceDescriptor[] = [
  {
    id: 'native:web-search',
    kind: 'tool',
    name: 'LibreChat Web Search',
    capabilities: ['web-search', 'research'],
    executionMode: 'tool',
    accessMethod: 'native-tool',
    permission: 'host-policy',
    trustLevel: 'native',
    legalUsage: 'host-policy',
    enabled: true,
    toolBinding: 'web_search',
    provenance: { source: 'librechat:native', verifiedAt: new Date().toISOString() },
  },
  {
    id: 'native:file-search',
    kind: 'tool',
    name: 'LibreChat File Search',
    capabilities: ['file-search', 'rag', 'documents'],
    executionMode: 'tool',
    accessMethod: 'native-tool',
    permission: 'host-policy',
    trustLevel: 'native',
    legalUsage: 'host-policy',
    enabled: true,
    toolBinding: 'file_search',
    provenance: { source: 'librechat:native', verifiedAt: new Date().toISOString() },
  },
  {
    id: 'native:execute-code',
    kind: 'tool',
    name: 'LibreChat Execute Code',
    capabilities: ['execute-code', 'sandbox', 'artifacts'],
    executionMode: 'tool',
    accessMethod: 'native-tool',
    permission: 'host-policy',
    trustLevel: 'native',
    legalUsage: 'host-policy',
    enabled: true,
    toolBinding: 'execute_code',
    provenance: { source: 'librechat:native', verifiedAt: new Date().toISOString() },
  },
  {
    id: 'native:subagents',
    kind: 'agent',
    name: 'LibreChat Subagents',
    capabilities: ['subagents', 'parallel-execution', 'nested-execution'],
    executionMode: 'agent',
    accessMethod: 'native-runtime',
    permission: 'host-policy',
    trustLevel: 'native',
    legalUsage: 'host-policy',
    enabled: true,
    provenance: { source: 'librechat:native', verifiedAt: new Date().toISOString() },
  },
  {
    id: 'native:background-tasks',
    kind: 'workflow',
    name: 'LibreChat Background Tasks',
    capabilities: ['run-in-background', 'resume', 'task-control'],
    executionMode: 'workflow',
    accessMethod: 'native-runtime',
    permission: 'host-policy',
    trustLevel: 'native',
    legalUsage: 'host-policy',
    enabled: true,
    toolBinding: 'run_in_background',
    provenance: { source: 'librechat:native', verifiedAt: new Date().toISOString() },
  },
  {
    id: 'native:skills',
    kind: 'tool',
    name: 'LibreChat Skills',
    capabilities: ['skills', 'skill-discovery', 'skill-execution'],
    executionMode: 'tool',
    accessMethod: 'native-runtime',
    permission: 'host-policy',
    trustLevel: 'native',
    legalUsage: 'host-policy',
    enabled: true,
    toolBinding: 'skills',
    provenance: { source: 'librechat:native', verifiedAt: new Date().toISOString() },
  },
  {
    id: 'native:artifacts',
    kind: 'tool',
    name: 'LibreChat Artifacts',
    capabilities: ['artifacts', 'artifact-production'],
    executionMode: 'tool',
    accessMethod: 'native-runtime',
    permission: 'host-policy',
    trustLevel: 'native',
    legalUsage: 'host-policy',
    enabled: true,
    toolBinding: 'artifacts',
    provenance: { source: 'librechat:native', verifiedAt: new Date().toISOString() },
  },
];

export interface RuntimeCapabilityCatalog {
  native: readonly CapabilityResourceDescriptor[];
  extensions: readonly CapabilityResourceDescriptor[];
  discoverySeeds: typeof CAPABILITY_DISCOVERY_SEEDS;
}

export function createRuntimeCapabilityCatalog(): RuntimeCapabilityCatalog {
  return {
    native: [...NATIVE_BOTMODE_CAPABILITIES, ...ACTIVE_PROVIDER_CAPABILITIES, ...VERIFIED_EXTERNAL_CAPABILITIES].map((resource) => ({
      ...resource,
      capabilities: [...resource.capabilities],
      provenance: resource.provenance ? { ...resource.provenance } : undefined,
    })),
    extensions: createBuiltinExtensionResources(),
    discoverySeeds: CAPABILITY_DISCOVERY_SEEDS.map((seed) => ({ ...seed, capabilities: [...seed.capabilities] })),
  };
}

export function createActivatedCapabilityRegistry(): CapabilityResourceRegistry {
  const registry = new CapabilityResourceRegistry();
  for (const resource of [...NATIVE_BOTMODE_CAPABILITIES, ...ACTIVE_PROVIDER_CAPABILITIES, ...VERIFIED_EXTERNAL_CAPABILITIES]) registry.register(resource);
  for (const resource of createBuiltinExtensionResources()) registry.register(resource);
  return registry;
}
