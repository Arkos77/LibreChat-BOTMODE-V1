import {
  createGovernedMediaProvider,
  GOVERNED_MEDIA_PROVIDER_BINDINGS,
  mediaBindingSupports,
} from './mediaProviderBindings';

describe('governed media provider bindings', () => {
  it('declares the multi-engine provider matrix', () => {
    expect(GOVERNED_MEDIA_PROVIDER_BINDINGS.map((binding) => binding.id)).toEqual([
      'openai:image-gen',
      'gemini:image-gen',
      'elevenlabs:tts',
      'minimax:video',
      'ltx:video',
      'tripo:3d',
    ]);
    expect(
      GOVERNED_MEDIA_PROVIDER_BINDINGS.find((binding) => binding.id === 'tripo:3d')?.mediaKinds,
    ).toEqual(['3d']);
  });

  it('creates a provider without coupling the router to provider SDKs', async () => {
    const binding = GOVERNED_MEDIA_PROVIDER_BINDINGS.find(
      (item) => item.id === 'openai:image-gen',
    )!;
    const provider = createGovernedMediaProvider(binding, async ({ toolName, args }) => ({
      mimeType: 'image/png',
      uri: 'mem://' + toolName,
      metadata: { prompt: (args as { prompt: string }).prompt },
    }));

    expect(mediaBindingSupports(provider.candidate, 'image')).toBe(true);
    expect(mediaBindingSupports(provider.candidate, 'video')).toBe(false);

    await expect(
      provider.generate(
        { taskId: 'task-1', traceId: 'trace-1', kind: 'image', prompt: 'test image' },
        { taskId: 'task-1', traceId: 'trace-1', attemptId: 'attempt-1' },
      ),
    ).resolves.toMatchObject({
      mimeType: 'image/png',
      uri: 'mem://image_gen_oai',
      metadata: { prompt: 'test image' },
    });
  });
});
