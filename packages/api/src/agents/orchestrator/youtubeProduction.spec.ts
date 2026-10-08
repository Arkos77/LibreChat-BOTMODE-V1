import {
  buildYouTubeReadiness,
  createYouTubeDataApiPublisher,
  createYouTubePublicationAuthorization,
  publishYouTubeWithResolvedGoogleAuth,
  publishYouTubeAfterExactApproval,
  runYouTubeDryRun,
  validateYouTubeMetadata,
  validateYouTubeScript,
  validateYouTubeSources,
} from './youtubeProduction';

const brief = {
  taskId: 'yt-task-1',
  traceId: 'yt-trace-1',
  title: 'Test production',
  description: 'Description',
  claims: [
    {
      id: 'c1',
      text: 'Paris is the capital of France',
      sourceUrl: 'https://example.com/source',
      sourceTitle: 'Source',
    },
  ],
  script: 'Paris is the capital of France.',
  mediaArtifactIds: ['media-1'],
  thumbnailArtifactId: 'thumb-1',
  seo: { title: 'SEO title', description: 'SEO description', tags: ['paris'] },
};

describe('P12 governed YouTube production', () => {
  it('accepts only claims with valid explicit sources', () => {
    expect(validateYouTubeSources(brief.claims).status).toBe('PASS');
    expect(
      validateYouTubeSources([{ ...brief.claims[0], sourceUrl: 'javascript:bad' }]).status,
    ).toBe('REJECT');
    expect(validateYouTubeSources([{ ...brief.claims[0], sourceTitle: '' }]).status).toBe('REJECT');
  });

  it('blocks unsourced scripts and missing metadata/media', () => {
    expect(validateYouTubeScript({ ...brief, script: 'unsourced text' }).status).toBe('REJECT');
    expect(validateYouTubeMetadata({ ...brief, mediaArtifactIds: [] }).status).toBe('REJECT');
    expect(
      buildYouTubeReadiness(
        { ...brief, thumbnailArtifactId: undefined },
        { status: 'PASS', checks: [], failures: [] },
      ).ready,
    ).toBe(false);
  });

  it('dry-runs the complete production chain without publishing', () => {
    const result = runYouTubeDryRun(brief);
    expect(result.qa.status).toBe('PASS');
    expect(result.readiness.ready).toBe(true);
    expect(result.publication).toBe('BLOCKED_PENDING_HUMAN_APPROVAL');
    expect(result.authorization.decision).toBe('HUMAN_APPROVAL_REQUIRED');
  });

  it('keeps publication fail-closed until exact human approval', async () => {
    const publisher = { publish: jest.fn(async () => ({ videoId: 'published-1' })) };
    await expect(
      publishYouTubeAfterExactApproval({
        publication: {
          taskId: brief.taskId,
          traceId: brief.traceId,
          channelId: 'channel-1',
          title: brief.title,
          description: brief.description,
          mediaArtifactId: 'media-1',
          authorization: createYouTubePublicationAuthorization({
            taskId: brief.taskId,
            traceId: brief.traceId,
            userId: 'user-1',
            channelId: 'channel-1',
            videoDigest: 'digest-1',
            approvalId: 'approval-1',
          }),
        },
        publisher,
        expectedApprovalId: 'approval-2',
        expectedVideoDigest: 'digest-1',
      }),
    ).rejects.toThrow('approval id mismatch');
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('publishes once approval and digest exactly match, then records analytics', async () => {
    const publisher = { publish: jest.fn(async () => ({ videoId: 'published-1' })) };
    const analytics = { recordPublished: jest.fn() };
    const result = await publishYouTubeAfterExactApproval({
      publication: {
        taskId: brief.taskId,
        traceId: brief.traceId,
        channelId: 'channel-1',
        title: brief.title,
        description: brief.description,
        mediaArtifactId: 'media-1',
        authorization: createYouTubePublicationAuthorization({
          taskId: brief.taskId,
          traceId: brief.traceId,
          userId: 'user-1',
          channelId: 'channel-1',
          videoDigest: 'digest-1',
          approvalId: 'approval-1',
        }),
      },
      publisher,
      analytics,
      expectedApprovalId: 'approval-1',
      expectedVideoDigest: 'digest-1',
    });
    expect(result.videoId).toBe('published-1');
    expect(publisher.publish).toHaveBeenCalledTimes(1);
    expect(analytics.recordPublished).toHaveBeenCalledWith({
      taskId: brief.taskId,
      traceId: brief.traceId,
      videoId: 'published-1',
    });
  });

  it('uploads the approved video through YouTube Data API and sets the thumbnail without storing OAuth tokens', async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const fetchImpl = jest.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, headers: Object.fromEntries(new Headers(init.headers).entries()) });
      return new Response(
        url.includes('thumbnails.set') || url.includes('thumbnails') ? '{}' : '{"id":"yt-1"}',
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    });
    const publisher = createYouTubeDataApiPublisher({
      accessToken: 'access-token-fixture',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      assets: {
        resolve: jest.fn(async (artifactId) =>
          artifactId === 'thumb-1'
            ? { bytes: new Uint8Array([1, 2]), mimeType: 'image/png', digest: 'thumb-digest' }
            : { bytes: new Uint8Array([3, 4, 5]), mimeType: 'video/mp4', digest: 'video-digest' },
        ),
      },
    });
    const result = await publisher.publish({
      taskId: brief.taskId,
      traceId: brief.traceId,
      channelId: 'channel-1',
      title: brief.title,
      description: brief.description!,
      mediaArtifactId: 'media-1',
      thumbnailArtifactId: 'thumb-1',
      authorization: createYouTubePublicationAuthorization({
        taskId: brief.taskId,
        traceId: brief.traceId,
        userId: 'user-1',
        channelId: 'channel-1',
        videoDigest: 'video-digest',
        approvalId: 'approval-1',
      }),
    });
    expect(result.videoId).toBe('yt-1');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(calls[0].headers.authorization).toBe('Bearer access-token-fixture');
    expect(calls[1].headers.authorization).toBe('Bearer access-token-fixture');
  });

  it('rejects real publication when resolved OAuth scope is insufficient', async () => {
    await expect(
      publishYouTubeWithResolvedGoogleAuth({
        publication: {
          taskId: brief.taskId,
          traceId: brief.traceId,
          channelId: 'channel-1',
          title: brief.title,
          description: brief.description!,
          mediaArtifactId: 'media-1',
          authorization: createYouTubePublicationAuthorization({
            taskId: brief.taskId,
            traceId: brief.traceId,
            userId: 'user-1',
            channelId: 'channel-1',
            videoDigest: 'video-digest',
            approvalId: 'approval-1',
          }),
          userId: 'user-1',
        },
        accessTokens: {
          resolve: jest.fn(async () => ({ accessToken: 'token', scopes: ['openid'] })),
        },
        assets: { resolve: jest.fn() },
        expectedApprovalId: 'approval-1',
        expectedVideoDigest: 'video-digest',
      }),
    ).rejects.toThrow('upload OAuth scope is missing');
  });
});
