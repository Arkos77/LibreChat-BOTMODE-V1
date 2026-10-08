import { createHash } from 'crypto';
import type { AuthorizedResourceCandidate, DecisionProvider, RoutingConstraints } from './routing';
import { createMtoEvent, type MtoEvent } from './mto';
import { rankAuthorizedResources } from './routing';

export type MediaKind = 'image' | 'audio' | 'video' | '3d';

export interface MediaInputRef {
  id: string;
  mimeType: string;
  source: 'user' | 'tool' | 'artifact';
}

export interface MediaGenerationBrief {
  taskId: string;
  traceId: string;
  kind: MediaKind;
  prompt: string;
  inputRefs?: readonly MediaInputRef[];
  width?: number;
  height?: number;
  durationMs?: number;
  format?: string;
  metadata?: Readonly<Record<string, string>>;
}

export interface MediaGenerationArtifact {
  artifactId: string;
  kind: MediaKind;
  mimeType: string;
  providerId: string;
  uri: string;
  byteLength?: number;
  digest: string;
  createdAt: string;
  provenance: {
    traceId: string;
    taskId: string;
    providerId: string;
    inputIds: string[];
  };
}

export interface MediaProviderCandidate extends AuthorizedResourceCandidate {
  providerId: string;
  capabilities: readonly string[];
  mediaKinds: readonly MediaKind[];
  executionMode: 'external-provider' | 'local-runtime' | 'tool';
}

export interface GenerationProviderContext {
  traceId: string;
  taskId: string;
  attemptId: string;
}

export interface GenerationProvider {
  readonly id: string;
  readonly candidate: MediaProviderCandidate;
  generate(
    brief: MediaGenerationBrief,
    context: GenerationProviderContext,
  ): Promise<MediaProviderResult>;
}

export interface MediaProviderResult {
  mimeType: string;
  uri: string;
  byteLength?: number;
  digest?: string;
  metadata?: Readonly<Record<string, string>>;
}

export interface MediaGenerationAdmission {
  authorize(input: {
    taskId: string;
    traceId: string;
    providerId: string;
    kind: MediaKind;
    estimatedCost?: number;
  }): Promise<void> | void;
}

export interface MediaPostProcessor {
  process(input: {
    brief: MediaGenerationBrief;
    providerId: string;
    result: MediaProviderResult;
  }): Promise<MediaProviderResult> | MediaProviderResult;
}

export interface MediaQualityGate {
  evaluate(input: {
    brief: MediaGenerationBrief;
    providerId: string;
    result: MediaProviderResult;
  }): Promise<MediaQualityResult> | MediaQualityResult;
}

export interface MediaQualityResult {
  status: 'VERIFIED' | 'REJECTED' | 'UNKNOWN' | 'HUMAN_REVIEW';
  criteria: readonly string[];
  evidenceIds: readonly string[];
}

export interface MediaArtifactStore {
  persist(input: MediaGenerationArtifact): Promise<MediaGenerationArtifact>;
}

export interface MediaGenerationResult {
  providerId: string;
  artifact: MediaGenerationArtifact;
  quality: MediaQualityResult;
  attempts: readonly string[];
  fallbackUsed: boolean;
}

export interface MediaGenerationProviderEvent {
  type:
    | 'REQUESTED'
    | 'DECIDED'
    | 'AUTHORIZED'
    | 'STARTED'
    | 'FALLBACK_SELECTED'
    | 'VERIFIED'
    | 'ARTIFACT_CREATED'
    | 'FAILED';
  providerId?: string;
  attemptId?: string;
  artifactId?: string;
  errorCode?: string;
}

function requiredText(name: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function digestProviderResult(result: MediaProviderResult): string {
  if (typeof result.digest === 'string' && /^[a-f0-9]{64}$/i.test(result.digest)) {
    return result.digest.toLowerCase();
  }
  return createHash('sha256')
    .update(
      JSON.stringify({ uri: result.uri, mimeType: result.mimeType, byteLength: result.byteLength }),
    )
    .digest('hex');
}

function buildArtifact(
  brief: MediaGenerationBrief,
  providerId: string,
  result: MediaProviderResult,
): MediaGenerationArtifact {
  const traceId = requiredText('traceId', brief.traceId);
  const taskId = requiredText('taskId', brief.taskId);
  const uri = requiredText('uri', result.uri);
  const mimeType = requiredText('mimeType', result.mimeType);
  const artifactId = createHash('sha256')
    .update(`${traceId}\0${taskId}\0${providerId}\0${digestProviderResult(result)}`)
    .digest('hex')
    .slice(0, 32);
  return {
    artifactId,
    kind: brief.kind,
    mimeType,
    providerId,
    uri,
    ...(result.byteLength == null ? {} : { byteLength: result.byteLength }),
    digest: digestProviderResult(result),
    createdAt: new Date().toISOString(),
    provenance: {
      traceId,
      taskId,
      providerId,
      inputIds: (brief.inputRefs ?? []).map((input) => requiredText('inputRef.id', input.id)),
    },
  };
}

/**
 * Governed media pipeline. The router only sees already-authorized provider
 * metadata. Admission happens per provider attempt. Provider failure may move
 * to the next authorized provider; it never replays the surrounding Run.
 */
export async function generateMediaWithFallback({
  brief,
  providers,
  constraints,
  admission,
  postProcess,
  qualityGate,
  artifactStore,
  decisionProvider,
  onEvent,
}: {
  brief: MediaGenerationBrief;
  providers: readonly GenerationProvider[];
  constraints?: RoutingConstraints;
  admission: MediaGenerationAdmission;
  postProcess?: MediaPostProcessor;
  qualityGate: MediaQualityGate;
  artifactStore: MediaArtifactStore;
  decisionProvider?: DecisionProvider;
  onEvent?: (event: MtoEvent<MediaGenerationProviderEvent>) => Promise<void> | void;
}): Promise<MediaGenerationResult> {
  requiredText('brief.taskId', brief.taskId);
  requiredText('brief.traceId', brief.traceId);
  requiredText('brief.prompt', brief.prompt);
  if (providers.length === 0) throw new Error('No authorized media providers');

  const compatible = providers.filter((provider) =>
    provider.candidate.mediaKinds.includes(brief.kind),
  );
  if (compatible.length === 0)
    throw new Error(`No authorized provider supports media kind ${brief.kind}`);

  const emit = (
    type: MediaGenerationProviderEvent['type'],
    data: Omit<MediaGenerationProviderEvent, 'type'> = {},
  ) => {
    if (!onEvent) return;
    return onEvent(
      createMtoEvent(
        type,
        {
          traceId: brief.traceId,
          traceEventId: `media:${type.toLowerCase()}:${brief.taskId}:${data.attemptId ?? 'selection'}`,
          taskId: brief.taskId,
          agentId: data.providerId,
          timestamp: new Date().toISOString(),
        },
        'host',
        { type, ...data },
      ),
    );
  };
  await emit('REQUESTED');
  const routing = await rankAuthorizedResources(compatible, { constraints }, decisionProvider);
  await emit('DECIDED', {
    providerId: compatible.find((provider) => provider.candidate.id === routing.selectedCandidateId)
      ?.id,
  });
  const selectedIds = routing.orderedCandidateIds;
  const byId = new Map(compatible.map((provider) => [provider.candidate.id, provider]));
  const attempts: string[] = [];
  let lastError: unknown;

  for (let index = 0; index < selectedIds.length; index++) {
    const candidateId = selectedIds[index];
    const provider = byId.get(candidateId);
    if (!provider) continue;
    const attemptId = `${brief.taskId}:media:${index + 1}`;
    attempts.push(provider.id);
    try {
      await admission.authorize({
        taskId: brief.taskId,
        traceId: brief.traceId,
        providerId: provider.id,
        kind: brief.kind,
        estimatedCost: provider.candidate.signals?.estimatedCost,
      });
      await emit('AUTHORIZED', { providerId: provider.id, attemptId });
      await emit('STARTED', { providerId: provider.id, attemptId });
      if (index > 0) {
        await emit('FALLBACK_SELECTED', { providerId: provider.id, attemptId });
      }
      let result = await provider.generate(brief, {
        traceId: brief.traceId,
        taskId: brief.taskId,
        attemptId,
      });
      if (postProcess) {
        result = await postProcess.process({ brief, providerId: provider.id, result });
      }
      const quality = await qualityGate.evaluate({ brief, providerId: provider.id, result });
      if (quality.status !== 'VERIFIED') {
        throw new Error(`Media quality gate ${quality.status} for ${provider.id}`);
      }
      await emit('VERIFIED', { providerId: provider.id, attemptId });
      const artifact = buildArtifact(brief, provider.id, result);
      const persisted = await artifactStore.persist(artifact);
      await emit('ARTIFACT_CREATED', {
        providerId: provider.id,
        attemptId,
        artifactId: persisted.artifactId,
      });
      return {
        providerId: provider.id,
        artifact: persisted,
        quality,
        attempts,
        fallbackUsed: index > 0,
      };
    } catch (error) {
      lastError = error;
      await emit('FAILED', {
        providerId: provider.id,
        attemptId,
        errorCode: error instanceof Error ? error.name : 'MEDIA_PROVIDER_FAILED',
      });
    }
  }

  throw lastError instanceof Error ? lastError : new Error('All authorized media providers failed');
}

export function createToolGenerationProvider(input: {
  id: string;
  toolName: string;
  mediaKinds: readonly MediaKind[];
  execute: (input: {
    toolName: string;
    args: unknown;
    context: GenerationProviderContext;
  }) => Promise<MediaProviderResult> | MediaProviderResult;
  capabilities?: readonly string[];
  signals?: MediaProviderCandidate['signals'];
}): GenerationProvider {
  return {
    id: requiredText('id', input.id),
    candidate: createMediaProviderCandidate({
      id: input.id,
      providerId: input.id,
      mediaKinds: input.mediaKinds,
      capabilities: input.capabilities,
      executionMode: 'tool',
      signals: input.signals,
    }),
    generate: async (brief, context) =>
      input.execute({
        toolName: input.toolName,
        args: {
          prompt: brief.prompt,
          ...(brief.width == null ? {} : { width: brief.width }),
          ...(brief.height == null ? {} : { height: brief.height }),
          ...(brief.durationMs == null ? {} : { durationMs: brief.durationMs }),
          ...(brief.format == null ? {} : { format: brief.format }),
        },
        context,
      }),
  };
}

export function createMediaProviderCandidate(input: {
  id: string;
  providerId: string;
  mediaKinds: readonly MediaKind[];
  capabilities?: readonly string[];
  executionMode?: MediaProviderCandidate['executionMode'];
  signals?: MediaProviderCandidate['signals'];
}): MediaProviderCandidate {
  requiredText('id', input.id);
  requiredText('providerId', input.providerId);
  if (input.mediaKinds.length === 0) throw new Error('mediaKinds must not be empty');
  return {
    id: input.id,
    providerId: input.providerId,
    modelId: input.providerId,
    mediaKinds: [...input.mediaKinds],
    capabilities: [...(input.capabilities ?? [`media:${input.mediaKinds.join(',')}`])],
    executionMode: input.executionMode ?? 'external-provider',
    signals: input.signals,
  };
}
