import {
  createMediaProviderCandidate,
  createToolGenerationProvider,
  generateMediaWithFallback,
  type GenerationProvider,
} from './mediaGeneration';

const brief = {
  taskId: 'media-task-1',
  traceId: 'media-trace-1',
  kind: 'image' as const,
  prompt: 'a controlled test image',
};

function provider(
  id: string,
  qualityScore: number,
  generate: GenerationProvider['generate'],
): GenerationProvider {
  return {
    id,
    candidate: createMediaProviderCandidate({
      id,
      providerId: id,
      mediaKinds: ['image', 'audio', 'video'],
      capabilities: ['media:image', 'media:audio', 'media:video'],
      signals: { qualityScore, estimatedCost: 1, latencyMs: 20 },
    }),
    generate,
  };
}

describe('P11 governed media generation', () => {
  it('routes two interchangeable providers through one pipeline and persists a verified artifact', async () => {
    const calls: string[] = [];
    const a = provider('provider-a', 0.2, async () => {
      calls.push('a');
      return { mimeType: 'image/png', uri: 'mem://a', byteLength: 3 };
    });
    const b = provider('provider-b', 0.9, async () => {
      calls.push('b');
      return { mimeType: 'image/png', uri: 'mem://b', byteLength: 4 };
    });
    const result = await generateMediaWithFallback({
      brief,
      providers: [a, b],
      admission: { authorize: jest.fn() },
      qualityGate: {
        evaluate: jest.fn(() => ({
          status: 'VERIFIED',
          criteria: ['mime'],
          evidenceIds: ['qa-1'],
        })),
      },
      artifactStore: { persist: jest.fn(async (artifact) => artifact) },
      decisionProvider: {
        id: 'RuleDecisionProvider',
        decide: ({ candidates }) => [
          candidates.find((candidate) => candidate.id === 'provider-b')?.id ?? 'provider-b',
        ],
      },
    });
    expect(calls).toEqual(['b']);
    expect(result.providerId).toBe('provider-b');
    expect(result.artifact.provenance).toMatchObject({
      traceId: brief.traceId,
      taskId: brief.taskId,
    });
  });

  it('fails over only after a provider attempt fails and reuses the same task identity', async () => {
    const admission = { authorize: jest.fn() };
    const calls: string[] = [];
    const events: string[] = [];
    const a = provider('provider-a', 0.9, async (_brief, context) => {
      calls.push(context.attemptId);
      throw new Error('provider-a failed');
    });
    const b = provider('provider-b', 0.8, async (_brief, context) => {
      calls.push(context.attemptId);
      return { mimeType: 'video/mp4', uri: 'mem://b' };
    });
    const result = await generateMediaWithFallback({
      brief: { ...brief, kind: 'video' },
      providers: [a, b],
      admission,
      qualityGate: {
        evaluate: () => ({ status: 'VERIFIED', criteria: ['mime'], evidenceIds: ['qa'] }),
      },
      artifactStore: { persist: async (artifact) => artifact },
      onEvent: async (event) => {
        events.push(event.payload?.type ?? event.type);
      },
    });
    expect(calls).toEqual(['media-task-1:media:1', 'media-task-1:media:2']);
    expect(result.fallbackUsed).toBe(true);
    expect(admission.authorize).toHaveBeenCalledTimes(2);
    expect(admission.authorize.mock.calls.map((call) => call[0].taskId)).toEqual([
      brief.taskId,
      brief.taskId,
    ]);
    expect(events).toContain('FALLBACK_SELECTED');
    expect(events).toContain('ARTIFACT_CREATED');
  });

  it('does not persist an artifact when QA rejects the provider result', async () => {
    const persist = jest.fn();
    const a = provider('provider-a', 0.9, async () => ({ mimeType: 'audio/mpeg', uri: 'mem://a' }));
    await expect(
      generateMediaWithFallback({
        brief: { ...brief, kind: 'audio' },
        providers: [a],
        admission: { authorize: jest.fn() },
        qualityGate: {
          evaluate: () => ({ status: 'REJECTED', criteria: ['duration'], evidenceIds: ['qa'] }),
        },
        artifactStore: { persist },
      }),
    ).rejects.toThrow('Media quality gate REJECTED');
    expect(persist).not.toHaveBeenCalled();
  });

  it('keeps missing media signal fail-closed when a hard constraint needs it', async () => {
    const a = createMediaProviderCandidate({
      id: 'a',
      providerId: 'a',
      mediaKinds: ['image'],
      signals: {},
    });
    const b = createMediaProviderCandidate({
      id: 'b',
      providerId: 'b',
      mediaKinds: ['image'],
      signals: { latencyMs: 5 },
    });
    const pa = { id: 'a', candidate: a, generate: jest.fn() } as unknown as GenerationProvider;
    const pb = { id: 'b', candidate: b, generate: jest.fn() } as unknown as GenerationProvider;
    await expect(
      generateMediaWithFallback({
        brief,
        providers: [pa, pb],
        constraints: { maxEstimatedCost: 2 },
        admission: { authorize: jest.fn() },
        qualityGate: { evaluate: () => ({ status: 'VERIFIED', criteria: [], evidenceIds: [] }) },
        artifactStore: { persist: async (artifact) => artifact },
      }),
    ).rejects.toThrow('No admissible authorized resource candidates');
    expect(pa.generate).not.toHaveBeenCalled();
    expect(pb.generate).not.toHaveBeenCalled();
  });

  it('routes a 3d generation provider through the same governed pipeline', async () => {
    const provider3d: GenerationProvider = {
      id: 'tripo-3d',
      candidate: createMediaProviderCandidate({
        id: 'tripo-3d',
        providerId: 'tripo-3d',
        mediaKinds: ['3d'],
        capabilities: ['media:3d'],
        signals: { qualityScore: 0.8, estimatedCost: 1, latencyMs: 20 },
      }),
      generate: async () => ({
        mimeType: 'model/gltf-binary',
        uri: 'mem://model.glb',
        byteLength: 42,
      }),
    };
    const result = await generateMediaWithFallback({
      brief: { ...brief, kind: '3d' },
      providers: [provider3d],
      admission: { authorize: jest.fn() },
      qualityGate: {
        evaluate: () => ({ status: 'VERIFIED', criteria: ['mime'], evidenceIds: ['qa-3d'] }),
      },
      artifactStore: { persist: async (artifact) => artifact },
    });
    expect(result.artifact.kind).toBe('3d');
    expect(result.artifact.mimeType).toBe('model/gltf-binary');
  });

  it('adapts registered image generation tools without coupling the pipeline to a provider SDK', async () => {
    const execute = jest.fn(async ({ toolName, args }: { toolName: string; args: unknown }) => {
      if (
        typeof args !== 'object' ||
        args === null ||
        !('prompt' in args) ||
        typeof args.prompt !== 'string'
      ) {
        throw new Error('Expected a media tool prompt');
      }
      return { mimeType: 'image/png', uri: `mem://${toolName}/${args.prompt}` };
    });
    const openai = createToolGenerationProvider({
      id: 'openai:image_gen_oai',
      toolName: 'image_gen_oai',
      mediaKinds: ['image'],
      execute,
    });
    const gemini = createToolGenerationProvider({
      id: 'gemini:gemini_image_gen',
      toolName: 'gemini_image_gen',
      mediaKinds: ['image'],
      execute,
    });
    for (const p of [openai, gemini]) {
      const result = await p.generate(brief, {
        traceId: brief.traceId,
        taskId: brief.taskId,
        attemptId: 'tool-adapter',
      });
      expect(result.mimeType).toBe('image/png');
    }
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'image_gen_oai',
        args: expect.objectContaining({ prompt: brief.prompt }),
      }),
    );
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'gemini_image_gen',
        args: expect.objectContaining({ prompt: brief.prompt }),
      }),
    );
  });
});
