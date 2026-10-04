import { createA2aTaskCancel, type A2aEnvelope, type A2aTaskCancel, type A2aTaskRequest, type A2aTaskResult, validateA2aEnvelope } from './a2a';

export interface A2aTransportResponse {
  status: number;
  json(): Promise<unknown>;
}

export type A2aFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<A2aTransportResponse>;

export interface A2aHttpTransportOptions {
  endpoint: string;
  fetchImpl?: A2aFetch;
  timeoutMs?: number;
  headers?: Readonly<Record<string, string>>;
  now?: () => Date;
}

const DEFAULT_TIMEOUT_MS = 15_000;

function assertEndpoint(endpoint: string): URL {
  const url = new URL(endpoint);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('A2A transport endpoint must use HTTP(S)');
  }
  return url;
}

function assertFresh(envelope: A2aEnvelope, now: Date): void {
  validateA2aEnvelope(envelope);
  if (Date.parse(envelope.expiresAt) <= now.getTime()) {
    throw new Error('A2A message is expired');
  }
}

function parseResult(value: unknown): A2aTaskResult {
  if (!value || typeof value !== 'object') throw new Error('A2A response must be an object');
  const result = value as A2aTaskResult;
  if (result.kind !== 'TASK_RESULT') throw new Error('A2A response kind is invalid');
  validateA2aEnvelope(result);
  if (!['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(result.status)) {
    throw new Error('A2A response status is invalid');
  }
  return {
    ...result,
    artifactRefs: [...result.artifactRefs],
  };
}

export class A2aHttpTransport {
  private readonly endpoint: URL;
  private readonly fetchImpl: A2aFetch;
  private readonly timeoutMs: number;
  private readonly headers: Readonly<Record<string, string>>;
  private readonly now: () => Date;

  constructor(options: A2aHttpTransportOptions) {
    this.endpoint = assertEndpoint(options.endpoint);
    this.fetchImpl = options.fetchImpl ?? (fetch as unknown as A2aFetch);
    this.timeoutMs = Math.max(100, Math.min(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 60_000));
    this.headers = { 'content-type': 'application/json', ...(options.headers ?? {}) };
    this.now = options.now ?? (() => new Date());
  }

  async send(request: A2aTaskRequest): Promise<A2aTaskResult> {
    assertFresh(request, this.now());
    if (request.kind !== 'TASK_REQUEST') throw new Error('A2A send expects TASK_REQUEST');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    timer.unref?.();
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: {
          ...this.headers,
          'a2a-message-id': request.messageId,
          'a2a-idempotency-key': request.idempotencyKey,
          'a2a-correlation-id': request.correlationId,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      if (!response || response.status < 200 || response.status >= 300) {
        throw new Error(`A2A transport HTTP ${String(response?.status ?? 0)}`);
      }
      return parseResult(await response.json());
    } finally {
      clearTimeout(timer);
    }
  }

  async cancel(cancel: A2aTaskCancel): Promise<A2aTaskResult> {
    assertFresh(cancel, this.now());
    if (cancel.kind !== 'TASK_CANCEL') throw new Error('A2A cancel expects TASK_CANCEL');
    const result = await this.sendPayload(cancel);
    return parseResult(result);
  }

  private async sendPayload(message: A2aTaskRequest | A2aTaskCancel): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    timer.unref?.();
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: {
          ...this.headers,
          'a2a-message-id': message.messageId,
          'a2a-idempotency-key': message.idempotencyKey,
          'a2a-correlation-id': message.correlationId,
        },
        body: JSON.stringify(message),
        signal: controller.signal,
      });
      if (!response || response.status < 200 || response.status >= 300) {
        throw new Error(`A2A transport HTTP ${String(response?.status ?? 0)}`);
      }
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createA2aCancelFromTask(request: A2aTaskRequest, reason: string, messageId: string, expiresAt: string): A2aTaskCancel {
  return createA2aTaskCancel({
    messageId,
    idempotencyKey: `${request.idempotencyKey}:cancel`,
    correlationId: request.correlationId,
    taskId: request.taskId,
    parentTaskId: request.parentTaskId,
    senderAgentId: request.senderAgentId,
    receiverAgentId: request.receiverAgentId,
    kind: 'TASK_CANCEL',
    createdAt: new Date().toISOString(),
    expiresAt,
    reason,
  });
}
