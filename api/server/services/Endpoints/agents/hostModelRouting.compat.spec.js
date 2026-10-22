const { initializeAgent, getProviderConfig, decideHostModel } = require('@librechat/api');
const { resolveHostModelRouting } = require('./hostModelRouting');
const { createServer } = require('node:http');
const { initializeModel, attemptInvoke, tryFallbackProviders } = require('@librechat/agents');
const { HumanMessage } = require('@librechat/agents/langchain/messages');

describe('OpenRouter compatibility binding through native initialization', () => {
  function setup(compatible, baseURL = 'https://openrouter.ai/api/v1') {
    const endpoint = {
      name: 'OpenRouterFreeCompatCI',
      apiKey: 'fixture-key-never-sent',
      baseURL,
      models: { fetch: false, default: ['openrouter/free'] },
      ...(compatible ? { customParams: { defaultParamsEndpoint: 'openAI' } } : {}),
    };
    const appConfig = { endpoints: { custom: [endpoint] } };
    const originalAgent = {
      id: 'compat-agent',
      name: 'Compatibility regression',
      provider: 'OpenRouter',
      model: 'primary:free',
      tools: [],
      model_parameters: { model: 'primary:free' },
    };
    const initialize = (agent) =>
      initializeAgent(
        {
          runtime: {
            user: { id: 'fixture-user' },
            appConfig,
            requestBody: {},
            turnStartedAt: 1,
          },
          agent,
          allowedProviders: new Set(['OpenRouter', endpoint.name]),
          endpointOption: { endpoint: 'agents' },
          loadTools: async () => ({ tools: [], toolDefinitions: [] }),
        },
        {
          getFiles: async () => [],
          getConvoFiles: async () => [],
          updateFilesUsage: async () => [],
        },
      );
    const persisted = [];
    return {
      persisted,
      request: {
        config: [
          {
            agentId: originalAgent.id,
            bindings: [
              {
                id: 'primary',
                provider: 'OpenRouter',
                model: 'primary:free',
                signals: { pricingTier: 'free', estimatedCost: 0 },
              },
              {
                id: 'fallback',
                provider: endpoint.name,
                model: 'openrouter/free',
                signals: { pricingTier: 'free', estimatedCost: 0 },
              },
            ],
            preferredBindingId: 'fallback',
            allowFailover: true,
            routingConstraints: { spendingPolicy: 'free_only' },
          },
        ],
        originalAgent,
        primaryConfig: {
          ...originalAgent,
          provider: 'openrouter',
          model_parameters: { model: 'primary:free' },
        },
        validate: async (agent) => ({
          isValid: agent.provider === endpoint.name && agent.model === 'openrouter/free',
        }),
        initialize,
        resolveRuntimeProvider: (provider) =>
          getProviderConfig({ provider, appConfig }).overrideProvider,
        decide: decideHostModel,
        persist: async (event) => {
          persisted.push(event);
        },
        traceId: 'compat-trace',
        traceEventId: 'compat-event',
        decisionId: 'compat-decision',
        user: 'fixture-user',
        timestamp: '2026-10-22T18:00:00.000Z',
      },
    };
  }

  it('reproduces the binding mismatch without explicit compatibility', async () => {
    const { request, persisted } = setup(false);
    await expect(resolveHostModelRouting(request)).rejects.toThrow('mismatched resolved binding');
    expect(persisted).toHaveLength(0);
  });

  it('keeps the authorized URL, key and model through initialization and host admission', async () => {
    const { request, persisted } = setup(true);
    const result = await resolveHostModelRouting(request);
    expect(result.provider).toBe('openAI');
    expect(result.model_parameters).toMatchObject({
      model: 'openrouter/free',
      apiKey: 'fixture-key-never-sent',
      configuration: { baseURL: 'https://openrouter.ai/api/v1' },
    });
    expect(result.hostModelDecision).toMatchObject({
      selectedBindingId: 'fallback',
      spendingPolicy: 'free_only',
    });
    expect(persisted).toHaveLength(1);
    expect(JSON.stringify(persisted)).not.toContain('fixture-key-never-sent');
  });

  it('executes the authorized SDK fallback after an HTTP 429 before any output', async () => {
    const calls = [];
    const server = createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += chunk;
      const { model } = JSON.parse(body);
      calls.push(model);
      res.setHeader('Content-Type', 'application/json');
      if (model === 'primary:free') {
        res.writeHead(429);
        res.end(
          JSON.stringify({
            error: { message: 'fixture rate limit', type: 'rate_limit_exceeded', code: 429 },
          }),
        );
        return;
      }
      res.end(
        JSON.stringify({
          id: 'fixture',
          object: 'chat.completion',
          created: 1,
          model,
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'fallback verified' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      );
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const baseURL = `http://127.0.0.1:${server.address().port}/openrouter/v1`;
      const { request } = setup(true, baseURL);
      request.config[0].preferredBindingId = 'primary';
      request.primaryConfig.model_parameters = {
        model: 'primary:free',
        apiKey: 'fixture-key-never-sent',
        configuration: { baseURL },
        streaming: false,
        maxRetries: 0,
      };
      const resolved = await resolveHostModelRouting(request);
      const [fallback] = resolved.model_parameters.fallbacks;
      fallback.clientOptions.streaming = false;
      fallback.clientOptions.maxRetries = 0;
      expect(fallback.provider).toBe('openAI');
      const messages = [new HumanMessage('fixture')];
      let primaryError;
      try {
        await attemptInvoke({
          model: initializeModel({
            provider: resolved.provider,
            clientOptions: resolved.model_parameters,
          }),
          provider: resolved.provider,
          messages,
          onChunk: async () => {},
        });
      } catch (error) {
        primaryError = error;
      }
      expect(primaryError).toBeDefined();
      const result = await tryFallbackProviders({
        fallbacks: [fallback],
        messages,
        primaryError,
        onChunk: async () => {},
      });
      expect(JSON.stringify(result)).toContain('fallback verified');
      expect(calls).toEqual(['primary:free', 'openrouter/free']);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
