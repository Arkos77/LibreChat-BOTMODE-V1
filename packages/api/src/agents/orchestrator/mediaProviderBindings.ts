import type { CapabilityResourceDescriptor } from './capabilityRegistry';
import {
  createToolGenerationProvider,
  type GenerationProvider,
  type MediaKind,
  type MediaProviderCandidate,
  type MediaProviderResult,
} from './mediaGeneration';

export type MediaProviderBindingStatus =
  | 'TOOL_RUNTIME'
  | 'MCP_CONFIGURED'
  | 'TEMPLATE'
  | 'LOCAL_RUNTIME_TEMPLATE';

export const CANONICAL_MEDIA_CAPABILITIES = [
  'image.generate',
  'image.edit',
  'video.generate',
  'voice.generate',
  'audio.generate',
  'music.generate',
  'avatar.generate',
  '3d.generate',
  'live.compose',
] as const;

export type CanonicalMediaCapability = (typeof CANONICAL_MEDIA_CAPABILITIES)[number];

export interface MediaProviderBinding {
  id: string;
  status: MediaProviderBindingStatus;
  toolName?: string;
  mcpServer?: string;
  mediaKinds: readonly MediaKind[];
  capabilities: readonly string[];
  estimatedCost?: number;
}

export const GOVERNED_MEDIA_PROVIDER_BINDINGS: readonly MediaProviderBinding[] = [
  {
    id: 'openai:image-gen',
    status: 'TOOL_RUNTIME',
    toolName: 'image_gen_oai',
    mediaKinds: ['image'],
    capabilities: ['image.generate', 'image.edit', 'media:image'],
  },
  {
    id: 'gemini:image-gen',
    status: 'TOOL_RUNTIME',
    toolName: 'gemini_image_gen',
    mediaKinds: ['image'],
    capabilities: ['image.generate', 'image.edit', 'media:image'],
  },
  {
    id: 'higgsfield:media',
    status: 'MCP_CONFIGURED',
    mcpServer: 'higgsfield',
    mediaKinds: ['image', 'audio', 'video'],
    capabilities: [
      'image.generate',
      'video.generate',
      'audio.generate',
      'avatar.generate',
      'media:image',
      'media:audio',
      'media:video',
    ],
  },
  {
    id: 'elevenlabs:tts',
    status: 'TEMPLATE',
    toolName: 'elevenlabs_tts',
    mediaKinds: ['audio'],
    capabilities: ['voice.generate', 'audio.generate', 'media:audio', 'media:voice', 'media:tts'],
  },
  {
    id: 'minimax:video',
    status: 'TEMPLATE',
    toolName: 'minimax_video',
    mediaKinds: ['video'],
    capabilities: ['video.generate', 'media:video'],
  },
  {
    id: 'ltx:video',
    status: 'TEMPLATE',
    toolName: 'ltx_video',
    mediaKinds: ['video'],
    capabilities: ['video.generate', 'media:video'],
  },
  {
    id: 'elevenlabs:music',
    status: 'TEMPLATE',
    toolName: 'elevenlabs_music',
    mediaKinds: ['audio'],
    capabilities: ['music.generate', 'audio.generate', 'media:music', 'media:audio'],
  },
  {
    id: 'tripo:3d',
    status: 'TEMPLATE',
    toolName: 'tripo_3d',
    mediaKinds: ['3d'],
    capabilities: ['3d.generate', 'media:3d'],
  },
  {
    id: 'local:gstreamer-compose',
    status: 'LOCAL_RUNTIME_TEMPLATE',
    mediaKinds: ['audio', 'video'],
    capabilities: ['live.compose', 'media:audio', 'media:video'],
  },
];

export const EXECUTABLE_MEDIA_TOOL_BINDINGS: readonly MediaProviderBinding[] =
  GOVERNED_MEDIA_PROVIDER_BINDINGS.filter((binding) => binding.status === 'TOOL_RUNTIME');

function mediaAccessMethod(binding: MediaProviderBinding): string {
  if (binding.status === 'MCP_CONFIGURED') return 'mcp';
  if (binding.status === 'LOCAL_RUNTIME_TEMPLATE') return 'local-runtime-template';
  if (binding.status === 'TEMPLATE') return 'provider-template';
  return 'native-tool';
}

function mediaProvenanceSource(binding: MediaProviderBinding): string {
  if (binding.status === 'MCP_CONFIGURED') {
    return 'librechat:mcp:' + binding.mcpServer;
  }
  if (binding.status === 'LOCAL_RUNTIME_TEMPLATE') return 'botmode:local-runtime-template';
  if (binding.status === 'TEMPLATE') return 'botmode:media-provider-template';
  return 'librechat:tool:' + binding.toolName;
}

export function createMediaCapabilityResources(
  verifiedAt: string = new Date().toISOString(),
): CapabilityResourceDescriptor[] {
  return GOVERNED_MEDIA_PROVIDER_BINDINGS.map((binding) => {
    const isLocalRuntimeTemplate = binding.status === 'LOCAL_RUNTIME_TEMPLATE';
    const isTemplate = binding.status === 'TEMPLATE' || isLocalRuntimeTemplate;
    const isMcp = binding.status === 'MCP_CONFIGURED';
    let kind: CapabilityResourceDescriptor['kind'];
    if (isLocalRuntimeTemplate) {
      kind = 'local-runtime';
    } else if (isMcp || isTemplate) {
      kind = 'external-provider';
    } else {
      kind = 'tool';
    }
    const executionMode = kind;
    return {
      id: 'media:' + binding.id,
      kind,
      name: binding.id,
      capabilities: [...binding.capabilities],
      executionMode,
      ...(isLocalRuntimeTemplate ? {} : { providerId: binding.id }),
      accessMethod: mediaAccessMethod(binding),
      networkRequirement: isLocalRuntimeTemplate ? 'optional' : 'internet',
      permission: 'host-policy',
      trustLevel: isTemplate ? 'declared' : 'configured-provider',
      legalUsage: 'provider-terms-review',
      enabled: !isTemplate,
      ...(binding.toolName ? { tools: [binding.toolName] } : {}),
      ...(binding.mcpServer ? { mcpServers: [binding.mcpServer] } : {}),
      ...(binding.estimatedCost == null
        ? {}
        : { signals: { estimatedCost: binding.estimatedCost } }),
      provenance: {
        source: mediaProvenanceSource(binding),
        verifiedAt,
      },
    };
  });
}

export function createGovernedMediaProvider(
  binding: MediaProviderBinding,
  execute: (input: {
    toolName: string;
    args: unknown;
    context: { traceId: string; taskId: string; attemptId: string };
  }) => Promise<MediaProviderResult> | MediaProviderResult,
): GenerationProvider {
  if (binding.status !== 'TOOL_RUNTIME' || !binding.toolName) {
    throw new Error('Media binding is not an executable tool runtime: ' + binding.id);
  }
  return createToolGenerationProvider({
    id: binding.id,
    toolName: binding.toolName,
    mediaKinds: binding.mediaKinds,
    capabilities: binding.capabilities,
    execute,
    signals: {
      ...(binding.estimatedCost === undefined ? {} : { estimatedCost: binding.estimatedCost }),
    },
  });
}

export function mediaBindingSupports(binding: MediaProviderCandidate, kind: MediaKind): boolean {
  return binding.mediaKinds.includes(kind);
}
