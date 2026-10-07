import {
  CANONICAL_MEDIA_CAPABILITIES,
  createGovernedMediaProvider,
  createMediaCapabilityResources,
  EXECUTABLE_MEDIA_TOOL_BINDINGS,
  GOVERNED_MEDIA_PROVIDER_BINDINGS,
  mediaBindingSupports,
} from './mediaProviderBindings';

describe('governed media provider bindings', () => {
  it('declares the multi-engine provider matrix without claiming templates are executable', () => {
    expect(GOVERNED_MEDIA_PROVIDER_BINDINGS.map((binding) => binding.id)).toEqual([
      'openai:image-gen',
      'gemini:image-gen',
      'higgsfield:media',
      'elevenlabs:tts',
      'minimax:video',
      'ltx:video',
      'elevenlabs:music',
      'tripo:3d',
      'local:gstreamer-compose',
    ]);
    expect(EXECUTABLE_MEDIA_TOOL_BINDINGS.map((binding) => binding.id)).toEqual([
      'openai:image-gen',
      'gemini:image-gen',
    ]);
    expect(
      GOVERNED_MEDIA_PROVIDER_BINDINGS.find((binding) => binding.id === 'higgsfield:media'),
    ).toMatchObject({
      status: 'MCP_CONFIGURED',
      mcpServer: 'higgsfield',
      mediaKinds: ['image', 'audio', 'video'],
    });
    expect(
      GOVERNED_MEDIA_PROVIDER_BINDINGS.find((binding) => binding.id === 'tripo:3d'),
    ).toMatchObject({
      status: 'TEMPLATE',
      mediaKinds: ['3d'],
      capabilities: expect.arrayContaining(['3d.generate']),
    });
  });

  it('defines the complete stable media capability vocabulary without inventing providers', () => {
    expect(CANONICAL_MEDIA_CAPABILITIES).toEqual([
      'image.generate',
      'image.edit',
      'video.generate',
      'voice.generate',
      'audio.generate',
      'music.generate',
      'avatar.generate',
      '3d.generate',
      'live.compose',
    ]);

    const resources = createMediaCapabilityResources('2026-10-06T00:00:00.000Z');
    expect(
      resources.find((resource) => resource.capabilities.includes('music.generate')),
    ).toMatchObject({
      id: 'media:elevenlabs:music',
      enabled: false,
      accessMethod: 'provider-template',
    });
    expect(
      resources.find((resource) => resource.capabilities.includes('live.compose')),
    ).toMatchObject({
      id: 'media:local:gstreamer-compose',
      enabled: false,
      kind: 'local-runtime',
      executionMode: 'local-runtime',
      accessMethod: 'local-runtime-template',
    });
  });

  it('projects configured media providers into the generic capability registry contract', () => {
    const resources = createMediaCapabilityResources('2026-10-06T00:00:00.000Z');
    expect(resources.find((resource) => resource.id === 'media:openai:image-gen')).toMatchObject({
      enabled: true,
      kind: 'tool',
      executionMode: 'tool',
      capabilities: expect.arrayContaining(['image.generate', 'image.edit']),
      tools: ['image_gen_oai'],
    });
    expect(resources.find((resource) => resource.id === 'media:higgsfield:media')).toMatchObject({
      enabled: true,
      kind: 'external-provider',
      executionMode: 'external-provider',
      capabilities: expect.arrayContaining(['image.generate', 'video.generate', 'avatar.generate']),
      mcpServers: ['higgsfield'],
    });
    expect(resources.find((resource) => resource.id === 'media:minimax:video')).toMatchObject({
      enabled: false,
      accessMethod: 'provider-template',
      capabilities: expect.arrayContaining(['video.generate']),
    });
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

  it('refuses to instantiate MCP/config templates as local tool providers', () => {
    const higgsfield = GOVERNED_MEDIA_PROVIDER_BINDINGS.find(
      (item) => item.id === 'higgsfield:media',
    )!;
    const minimax = GOVERNED_MEDIA_PROVIDER_BINDINGS.find((item) => item.id === 'minimax:video')!;
    const gstreamer = GOVERNED_MEDIA_PROVIDER_BINDINGS.find(
      (item) => item.id === 'local:gstreamer-compose',
    )!;

    expect(() => createGovernedMediaProvider(higgsfield, jest.fn())).toThrow(
      'Media binding is not an executable tool runtime: higgsfield:media',
    );
    expect(() => createGovernedMediaProvider(minimax, jest.fn())).toThrow(
      'Media binding is not an executable tool runtime: minimax:video',
    );
    expect(() => createGovernedMediaProvider(gstreamer, jest.fn())).toThrow(
      'Media binding is not an executable tool runtime: local:gstreamer-compose',
    );
  });
});
