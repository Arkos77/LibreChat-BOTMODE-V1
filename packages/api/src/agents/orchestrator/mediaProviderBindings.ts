import {
  createToolGenerationProvider,
  type GenerationProvider,
  type MediaKind,
  type MediaProviderCandidate,
  type MediaProviderResult,
} from './mediaGeneration';

export interface MediaProviderBinding {
  id: string;
  toolName: string;
  mediaKinds: readonly MediaKind[];
  capabilities: readonly string[];
  estimatedCost?: number;
}

export const GOVERNED_MEDIA_PROVIDER_BINDINGS: readonly MediaProviderBinding[] = [
  {
    id: 'openai:image-gen',
    toolName: 'image_gen_oai',
    mediaKinds: ['image'],
    capabilities: ['media:image'],
  },
  {
    id: 'gemini:image-gen',
    toolName: 'gemini_image_gen',
    mediaKinds: ['image'],
    capabilities: ['media:image'],
  },
  {
    id: 'elevenlabs:tts',
    toolName: 'elevenlabs_tts',
    mediaKinds: ['audio'],
    capabilities: ['media:audio', 'media:voice', 'media:tts'],
  },
  {
    id: 'minimax:video',
    toolName: 'minimax_video',
    mediaKinds: ['video'],
    capabilities: ['media:video'],
  },
  {
    id: 'ltx:video',
    toolName: 'ltx_video',
    mediaKinds: ['video'],
    capabilities: ['media:video'],
  },
  {
    id: 'tripo:3d',
    toolName: 'tripo_3d',
    mediaKinds: ['3d'],
    capabilities: ['media:3d'],
  },
];

export function createGovernedMediaProvider(
  binding: MediaProviderBinding,
  execute: (input: {
    toolName: string;
    args: unknown;
    context: { traceId: string; taskId: string; attemptId: string };
  }) => Promise<MediaProviderResult> | MediaProviderResult,
): GenerationProvider {
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
