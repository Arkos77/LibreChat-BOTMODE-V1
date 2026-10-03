import { createHash } from 'crypto';
import { createAuthorizationRecord, type AuthorizationRecord } from './authorization';

export interface SourcedClaim {
  id: string;
  text: string;
  sourceUrl: string;
  sourceTitle: string;
}

export interface YouTubeProductionBrief {
  taskId: string;
  traceId: string;
  title: string;
  description?: string;
  claims: readonly SourcedClaim[];
  script: string;
  mediaArtifactIds: readonly string[];
  thumbnailArtifactId?: string;
  seo?: {
    title?: string;
    description?: string;
    tags?: readonly string[];
  };
}

export interface YouTubeQaResult {
  status: 'PASS' | 'REJECT' | 'HUMAN_REVIEW';
  checks: readonly string[];
  failures: readonly string[];
}

export interface YouTubeReadiness {
  ready: boolean;
  reasons: readonly string[];
}

export interface YouTubeMediaAssetResolver {
  resolve(artifactId: string): Promise<{ bytes: Uint8Array; mimeType: string; digest: string }>;
}

export interface YouTubeAccessTokenResolver {
  resolve(input: {
    userId: string;
    channelId: string;
  }): Promise<{ accessToken: string; scopes?: readonly string[] }>;
}

export interface YouTubePublicationInput {
  taskId: string;
  traceId: string;
  channelId: string;
  title: string;
  description: string;
  mediaArtifactId: string;
  thumbnailArtifactId?: string;
  authorization: AuthorizationRecord;
  userId?: string;
  privacyStatus?: 'private' | 'unlisted' | 'public';
  categoryId?: string;
  tags?: readonly string[];
  containsSyntheticMedia?: boolean;
}

export interface YouTubePublisher {
  publish(input: YouTubePublicationInput): Promise<{ videoId: string }>;
}

export interface YouTubeAnalyticsCollector {
  recordPublished(input: {
    taskId: string;
    traceId: string;
    videoId: string;
  }): Promise<void> | void;
}

export interface YouTubeProductionResult {
  qa: YouTubeQaResult;
  readiness: YouTubeReadiness;
  authorization: AuthorizationRecord;
  publication: 'NOT_REQUESTED' | 'BLOCKED_PENDING_HUMAN_APPROVAL';
}

function requireNonEmpty(name: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '')
    throw new Error(`${name} must be non-empty`);
  return value.trim();
}

function hasClaimSource(claim: SourcedClaim): boolean {
  try {
    const url = new URL(claim.sourceUrl);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.length > 0;
  } catch {
    return false;
  }
}

export function createYouTubeDataApiPublisher(input: {
  accessToken: string;
  assets: YouTubeMediaAssetResolver;
  fetchImpl?: typeof fetch;
  categoryId?: string;
}): YouTubePublisher {
  const fetchImpl = input.fetchImpl ?? fetch;
  if (typeof input.accessToken !== 'string' || input.accessToken.trim() === '') {
    throw new Error('YouTube access token is required');
  }
  return {
    async publish(publication) {
      const video = await input.assets.resolve(publication.mediaArtifactId);
      if (!video.mimeType.startsWith('video/'))
        throw new Error('YouTube media artifact must be video/*');
      const metadata = {
        snippet: {
          title: publication.title,
          description: publication.description,
          categoryId: publication.categoryId ?? input.categoryId ?? '22',
          ...(publication.tags?.length ? { tags: [...publication.tags] } : {}),
        },
        status: {
          privacyStatus: publication.privacyStatus ?? 'private',
          ...(publication.containsSyntheticMedia === undefined
            ? {}
            : { containsSyntheticMedia: publication.containsSyntheticMedia }),
        },
      };
      const boundary = `botmode-${publication.taskId}-${Date.now()}`;
      const metadataBody = JSON.stringify(metadata);
      const preamble = [
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        metadataBody,
        `--${boundary}`,
        `Content-Type: ${video.mimeType}`,
        '',
      ].join('\r\n');
      const suffix = `\r\n--${boundary}--\r\n`;
      const body = new Uint8Array(
        Buffer.concat([Buffer.from(preamble), Buffer.from(video.bytes), Buffer.from(suffix)]),
      );
      const response = await fetchImpl(
        'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${input.accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body,
        },
      );
      if (!response.ok) {
        throw new Error(`YouTube videos.insert failed (${response.status})`);
      }
      const payload = (await response.json()) as { id?: string };
      if (!payload.id) throw new Error('YouTube videos.insert returned no video id');

      if (publication.thumbnailArtifactId) {
        const thumbnail = await input.assets.resolve(publication.thumbnailArtifactId);
        if (!thumbnail.mimeType.startsWith('image/'))
          throw new Error('YouTube thumbnail artifact must be image/*');
        const thumbnailResponse = await fetchImpl(
          `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(payload.id)}`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${input.accessToken}`,
              'Content-Type': thumbnail.mimeType,
            },
            body: thumbnail.bytes,
          },
        );
        if (!thumbnailResponse.ok)
          throw new Error(`YouTube thumbnails.set failed (${thumbnailResponse.status})`);
      }
      return { videoId: payload.id };
    },
  };
}

export async function publishYouTubeWithResolvedGoogleAuth(input: {
  publication: YouTubePublicationInput;
  accessTokens: YouTubeAccessTokenResolver;
  assets: YouTubeMediaAssetResolver;
  expectedApprovalId: string;
  expectedVideoDigest: string;
  fetchImpl?: typeof fetch;
  analytics?: YouTubeAnalyticsCollector;
}): Promise<{ videoId: string }> {
  const userId = requireNonEmpty('userId', input.publication.userId ?? '');
  const resolved = await input.accessTokens.resolve({
    userId,
    channelId: input.publication.channelId,
  });
  if (
    !resolved.scopes?.some(
      (scope) =>
        scope === 'https://www.googleapis.com/auth/youtube.upload' ||
        scope === 'https://www.googleapis.com/auth/youtube',
    )
  ) {
    throw new Error('YouTube upload OAuth scope is missing');
  }
  return publishYouTubeAfterExactApproval({
    publication: input.publication,
    publisher: createYouTubeDataApiPublisher({
      accessToken: resolved.accessToken,
      assets: input.assets,
      fetchImpl: input.fetchImpl,
    }),
    analytics: input.analytics,
    expectedApprovalId: input.expectedApprovalId,
    expectedVideoDigest: input.expectedVideoDigest,
  });
}

export function validateYouTubeSources(claims: readonly SourcedClaim[]): YouTubeQaResult {
  const failures: string[] = [];
  for (const claim of claims) {
    if (!requireNonEmpty('claim.id', claim.id) || !requireNonEmpty('claim.text', claim.text)) {
      failures.push(`claim:${claim.id || 'unknown'}:missing-text`);
    }
    if (!hasClaimSource(claim)) failures.push(`claim:${claim.id || 'unknown'}:invalid-source`);
    if (!claim.sourceTitle?.trim())
      failures.push(`claim:${claim.id || 'unknown'}:missing-source-title`);
  }
  return {
    status: failures.length ? 'REJECT' : 'PASS',
    checks: ['claims-sourced', 'source-urls-valid'],
    failures,
  };
}

export function validateYouTubeScript(brief: YouTubeProductionBrief): YouTubeQaResult {
  const failures: string[] = [];
  requireNonEmpty('script', brief.script);
  const claimIds = new Set(brief.claims.map((claim) => claim.id));
  const referenced = [...brief.claims].filter((claim) => brief.script.includes(claim.text));
  if (brief.claims.length > 0 && referenced.length === 0)
    failures.push('script:contains-no-sourced-claim-text');
  if (claimIds.size !== brief.claims.length) failures.push('claims:duplicate-id');
  return {
    status: failures.length ? 'REJECT' : 'PASS',
    checks: ['script-present', 'script-sourced'],
    failures,
  };
}

export function validateYouTubeMetadata(brief: YouTubeProductionBrief): YouTubeQaResult {
  const failures: string[] = [];
  const seoTitle = brief.seo?.title ?? brief.title;
  if (!requireNonEmpty('seo.title', seoTitle)) failures.push('seo:title-missing');
  const description = brief.seo?.description ?? brief.description;
  if (!description?.trim()) failures.push('seo:description-missing');
  if (
    brief.seo?.tags &&
    brief.seo.tags.some((tag) => typeof tag !== 'string' || tag.trim() === '')
  ) {
    failures.push('seo:invalid-tag');
  }
  if (brief.mediaArtifactIds.length === 0) failures.push('media:missing');
  return {
    status: failures.length ? 'REJECT' : 'PASS',
    checks: ['seo-present', 'media-present'],
    failures,
  };
}

export function buildYouTubeReadiness(
  brief: YouTubeProductionBrief,
  qa: YouTubeQaResult,
): YouTubeReadiness {
  const reasons = [...qa.failures];
  if (!brief.thumbnailArtifactId) reasons.push('thumbnail:missing');
  if (brief.mediaArtifactIds.length === 0) reasons.push('media:missing');
  return { ready: qa.status === 'PASS' && reasons.length === 0, reasons };
}

export function createYouTubePublicationAuthorization(input: {
  taskId: string;
  traceId: string;
  userId: string;
  channelId: string;
  videoDigest: string;
  approvalId: string;
  timestamp?: string;
}): AuthorizationRecord {
  requireNonEmpty('channelId', input.channelId);
  requireNonEmpty('videoDigest', input.videoDigest);
  requireNonEmpty('approvalId', input.approvalId);
  return createAuthorizationRecord({
    authorizationId: createHash('sha256')
      .update(`youtube-publish\0${input.traceId}\0${input.approvalId}\0${input.videoDigest}`)
      .digest('hex'),
    traceId: requireNonEmpty('traceId', input.traceId),
    taskId: requireNonEmpty('taskId', input.taskId),
    actorId: requireNonEmpty('userId', input.userId),
    capability: 'youtube.publish',
    scope: `channel:${input.channelId}:video:${input.videoDigest}`,
    policyVersion: 'botmode-youtube-publish-v1',
    decision: 'ALLOW',
    humanApproval: { required: true, approvalId: input.approvalId },
    timestamp: input.timestamp ?? new Date().toISOString(),
  });
}

/** Dry-run production chain. It prepares and validates all release inputs but deliberately does not publish. */
export function runYouTubeDryRun(brief: YouTubeProductionBrief): YouTubeProductionResult {
  requireNonEmpty('taskId', brief.taskId);
  requireNonEmpty('traceId', brief.traceId);
  requireNonEmpty('title', brief.title);
  const sourceQa = validateYouTubeSources(brief.claims);
  const scriptQa = validateYouTubeScript(brief);
  const metadataQa = validateYouTubeMetadata(brief);
  const failures = [...sourceQa.failures, ...scriptQa.failures, ...metadataQa.failures];
  const qa: YouTubeQaResult = {
    status: failures.length ? 'REJECT' : 'PASS',
    checks: [...sourceQa.checks, ...scriptQa.checks, ...metadataQa.checks],
    failures,
  };
  const readiness = buildYouTubeReadiness(brief, qa);
  const authorization = createAuthorizationRecord({
    authorizationId: createHash('sha256')
      .update(`youtube-dry-run\0${brief.traceId}\0${brief.taskId}`)
      .digest('hex'),
    traceId: brief.traceId,
    taskId: brief.taskId,
    actorId: 'host',
    capability: 'youtube.publish',
    scope: `task:${brief.taskId}:pending`,
    policyVersion: 'botmode-youtube-publish-v1',
    decision: readiness.ready ? 'HUMAN_APPROVAL_REQUIRED' : 'DENY',
    humanApproval: { required: readiness.ready },
    timestamp: new Date().toISOString(),
  });
  return {
    qa,
    readiness,
    authorization,
    publication: readiness.ready ? 'BLOCKED_PENDING_HUMAN_APPROVAL' : 'NOT_REQUESTED',
  };
}

export async function publishYouTubeAfterExactApproval(input: {
  publication: YouTubePublicationInput;
  publisher: YouTubePublisher;
  analytics?: YouTubeAnalyticsCollector;
  expectedApprovalId: string;
  expectedVideoDigest: string;
}): Promise<{ videoId: string }> {
  if (input.publication.authorization.decision !== 'ALLOW') {
    throw new Error('YouTube publication authorization is not ALLOW');
  }
  if (input.publication.authorization.humanApproval?.approvalId !== input.expectedApprovalId) {
    throw new Error('YouTube approval id mismatch');
  }
  const scopeDigest = input.publication.authorization.scope.split(':video:')[1];
  if (scopeDigest !== input.expectedVideoDigest) throw new Error('YouTube video digest mismatch');
  const result = await input.publisher.publish(input.publication);
  await input.analytics?.recordPublished({
    taskId: input.publication.taskId,
    traceId: input.publication.traceId,
    videoId: result.videoId,
  });
  return result;
}
