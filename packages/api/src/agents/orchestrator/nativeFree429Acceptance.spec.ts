import { createServer, type Server } from 'node:http';
import { AIMessageChunk, HumanMessage } from '@librechat/agents/langchain/messages';
import { attemptInvoke, FakeChatModel, Providers, tryFallbackProviders } from '@librechat/agents';
import type { AddressInfo } from 'node:net';
import { decideHostModel } from './hostModelDecision';

const FREE_PRIMARY = 'ci-primary:free';
const FREE_ALTERNATE = 'ci-alternate:free';

type ModelErrorKind = 'rate_limit' | 'ordinary' | 'partial_rate_limit';

async function makeObservedPrimaryError(kind: ModelErrorKind): Promise<unknown> {
  const model = new FakeChatModel({ responses: ['unused'] });
  const error =
    kind === 'ordinary'
      ? new Error('unsupported provider request')
      : Object.assign(new Error('CI typed quota'), {
          status: 429,
          code: 'rate_limit',
          lc_error_code: 'MODEL_RATE_LIMIT',
        });
  // Pass through the REAL SDK attempt funnel so its private WeakMap records
  // whether a model already produced a chunk. Hand-constructing an exception
  // would not exercise the actual zero-chunk fallback condition.
  (model as unknown as { stream: unknown }).stream = async function* () {
    if (kind === 'partial_rate_limit') {
      yield new AIMessageChunk({ content: 'A partial response must never be replaced' });
    }
    throw error;
  };
  try {
    await attemptInvoke({
      model,
      messages: [new HumanMessage('CI free-only fallback probe')],
      provider: Providers.OPENAI,
    });
  } catch (caught) {
    return caught;
  }
  throw new Error('CI primary must reject');
}

async function startLocalFreeModel(): Promise<{
  baseURL: string;
  requests: string[];
  close(): Promise<void>;
}> {
  const requests: string[] = [];
  const server: Server = createServer(async (req, res) => {
    if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
      res.writeHead(404).end();
      return;
    }
    try {
      const chunks: Buffer[] = [];
      for await (const part of req) {
        chunks.push(Buffer.from(part));
        if (Buffer.concat(chunks).length > 64 * 1024) {
          res.writeHead(413).end();
          return;
        }
      }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        model?: string;
        stream?: boolean;
      };
      requests.push(input.model ?? 'missing');
      if (input.model !== FREE_ALTERNATE) {
        res.writeHead(400).end();
        return;
      }
      const base = {
        id: 'chatcmpl-ci-free-only',
        object: 'chat.completion.chunk',
        created: 1700000000,
        model: FREE_ALTERNATE,
      };
      if (input.stream !== true) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            ...base,
            object: 'chat.completion',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'CI_FREE_FALLBACK_OK' },
                finish_reason: 'stop',
              },
            ],
          }),
        );
        return;
      }
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'close',
      });
      const send = (delta: Record<string, unknown>, finish_reason: string | null) => {
        res.write(
          'data: ' +
            JSON.stringify({
              ...base,
              choices: [{ index: 0, delta, finish_reason }],
            }) +
            '\n\n',
        );
      };
      send({ role: 'assistant' }, null);
      send({ content: 'CI_FREE_FALLBACK_OK' }, null);
      send({}, 'stop');
      res.end('data: [DONE]\n\n');
    } catch {
      res.writeHead(400).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    baseURL: `http://127.0.0.1:${port}/v1`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

describe('native SDK strict 429 fallback after host free_only admission', () => {
  jest.setTimeout(30000);

  it('serves a typed zero-chunk 429 through the only host-approved local free fallback', async () => {
    const fixture = await startLocalFreeModel();
    try {
      // Use the production host's explicit provider/model binding contract:
      // provider identity is OpenRouter; executable SDK transport is a
      // separately resolved OpenAI-compatible binding at a CI-only loopback URL.
      const routed = await decideHostModel({
        agentId: 'ci-agent',
        bindings: [
          {
            id: 'free-primary',
            provider: 'OpenRouter',
            runtimeProvider: Providers.OPENAI,
            model: FREE_PRIMARY,
            options: { model: FREE_PRIMARY, apiKey: 'local-ci-only' },
            signals: { pricingTier: 'free' },
          },
          {
            id: 'free-alternate',
            provider: 'OpenRouter',
            runtimeProvider: Providers.OPENAI,
            model: FREE_ALTERNATE,
            options: {
              model: FREE_ALTERNATE,
              apiKey: 'local-ci-only',
              configuration: { baseURL: fixture.baseURL },
            },
            signals: { pricingTier: 'free' },
          },
          {
            id: 'unapproved-paid',
            provider: 'OpenRouter',
            runtimeProvider: Providers.OPENAI,
            model: 'ci-paid-model',
            options: { model: 'ci-paid-model', apiKey: 'local-ci-only' },
            signals: { pricingTier: 'paid' },
          },
        ],
        preferredBindingId: 'free-primary',
        routingMode: 'static',
        routingConstraints: { spendingPolicy: 'free_only' },
        allowFailover: true,
        traceId: 'ci-free-only-429',
        decisionId: 'ci-free-only-429-decision',
        traceEventId: 'ci-free-only-429-event',
        timestamp: '2026-10-19T12:00:00.000Z',
      });
      const fallbacks = routed.modelParameters.fallbacks as Parameters<
        typeof tryFallbackProviders
      >[0]['fallbacks'];
      expect(fallbacks).toHaveLength(1);
      expect(fallbacks[0]).toMatchObject({
        retryOn: 'MODEL_RATE_LIMIT_ZERO_CHUNK',
        clientOptions: { model: FREE_ALTERNATE },
      });
      expect(JSON.stringify(fallbacks)).not.toContain('ci-paid-model');
      const primaryError = await makeObservedPrimaryError('rate_limit');
      const deliveredChunks: string[] = [];
      const served = await tryFallbackProviders({
        fallbacks,
        primaryError,
        messages: [new HumanMessage('CI only: no external provider')],
        // A direct SDK invocation has no graph. Let the public onChunk
        // consumer receive the stream; otherwise its default handler
        // correctly rejects the missing graph before the test can assert.
        onChunk: (chunk) => {
          deliveredChunks.push(String(chunk.content ?? ''));
        },
      });
      expect(deliveredChunks.join('')).toContain('CI_FREE_FALLBACK_OK');
      expect(served).toBeDefined();
      expect(fixture.requests).toEqual([FREE_ALTERNATE]);
      console.log('CI_NATIVE_429_TO_AUTHORIZED_FREE_ONLY=PASS');
    } finally {
      await fixture.close();
    }
  });

  it.each(['ordinary', 'partial_rate_limit'] as const)(
    'refuses to switch after %s (zero approved external attempts)',
    async (kind) => {
      const fixture = await startLocalFreeModel();
      try {
        const primaryError = await makeObservedPrimaryError(kind);
        await expect(
          tryFallbackProviders({
            fallbacks: [
              {
                provider: Providers.OPENAI,
                clientOptions: {
                  model: FREE_ALTERNATE,
                  apiKey: 'local-ci-only',
                  configuration: { baseURL: fixture.baseURL },
                },
                retryOn: 'MODEL_RATE_LIMIT_ZERO_CHUNK',
              },
            ],
            primaryError,
            messages: [new HumanMessage('CI negative fallback test')],
          }),
        ).rejects.toBe(primaryError);
        expect(fixture.requests).toHaveLength(0);
        console.log('CI_NATIVE_UNSAFE_OR_PARTIAL_FALLBACK_DENIED=PASS');
      } finally {
        await fixture.close();
      }
    },
  );
});
