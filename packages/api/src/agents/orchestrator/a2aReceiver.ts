import { type A2aTaskRequest, type A2aTaskResult, createA2aTaskCancel, validateA2aEnvelope } from './a2a';

export interface A2aReceiverDispatcher {
  request(message: A2aTaskRequest): Promise<A2aTaskResult>;
  cancel(message: ReturnType<typeof createA2aTaskCancel>): Promise<A2aTaskResult>;
}

export interface A2aReceiverOptions {
  maxBodyBytes?: number;
  now?: () => Date;
}

const DEFAULT_MAX_BODY_BYTES = 256 * 1024;

function freshOrThrow(message: Parameters<typeof validateA2aEnvelope>[0], now: Date): void {
  validateA2aEnvelope(message);
  if (Date.parse(message.expiresAt) <= now.getTime()) {
    throw new Error('A2A message is expired');
  }
}

export function createA2aReceiver(options: A2aReceiverOptions, dispatcher: A2aReceiverDispatcher) {
  const maxBodyBytes = Math.max(1024, Math.min(options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES, 4 * 1024 * 1024));
  const now = options.now ?? (() => new Date());
  const replay = new Map<string, { expiresAt: number; result: A2aTaskResult }>();

  function cleanup(ts: number): void {
    for (const [key, value] of replay) {
      if (value.expiresAt <= ts) replay.delete(key);
    }
  }

  return {
    async handle(message: A2aTaskRequest | ReturnType<typeof createA2aTaskCancel>, bodyBytes = 0): Promise<A2aTaskResult> {
      if (bodyBytes > maxBodyBytes) throw new Error('A2A request body is too large');
      freshOrThrow(message, now());
      cleanup(now().getTime());

      const cached = replay.get(message.idempotencyKey);
      if (cached != null && cached.expiresAt > now().getTime()) return cached.result;

      const result =
        message.kind === 'TASK_REQUEST'
          ? await dispatcher.request(message)
          : await dispatcher.cancel(message);

      validateA2aEnvelope(result);
      replay.set(message.idempotencyKey, {
        expiresAt: Math.min(Date.parse(message.expiresAt), now().getTime() + 5 * 60_000),
        result,
      });
      return result;
    },
  };
}
