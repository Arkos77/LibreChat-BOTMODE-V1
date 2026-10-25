const fs = require('node:fs');
const assert = require('node:assert/strict');
const { configSchema } = require('librechat-data-provider');

const config = JSON.parse(fs.readFileSync(0, 'utf8'));
const result = configSchema.safeParse(config);
if (!result.success) {
  for (const issue of result.error.issues) {
    console.error(`${issue.path.join('.')}: ${issue.message}`);
  }
  process.exitCode = 1;
} else {
  console.log('HOST_RESEARCH_CONFIG_SCHEMA=PASS');
  if (process.argv.includes('--runtime-binding')) {
    assert.equal(
      config.endpoints.agents.hostModelRouting?.[0]?.bindings?.[0]?.id,
      'controlled-primary',
    );
    validateFallbackBinding(config).catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}

async function validateFallbackBinding(appConfig) {
  const { initializeAgent, getProviderConfig, decideHostModel } = require('@librechat/api');
  const { resolveHostModelRouting } = require(
    require('node:path').resolve(
      process.cwd(),
      'api/server/services/Endpoints/agents/hostModelRouting',
    ),
  );
  const originalAgent = {
    id: 'ci-runtime-binding',
    name: 'BOT MODE Worker',
    provider: 'OpenRouter',
    model: 'openrouter/free',
    tools: [],
    model_parameters: { model: 'openrouter/free' },
  };
  const initialize = (agent) =>
    initializeAgent(
      {
        runtime: { user: { id: 'ci-config-only' }, appConfig, requestBody: {}, turnStartedAt: 1 },
        agent,
        allowedProviders: new Set(appConfig.endpoints.custom.map((e) => e.name)),
        endpointOption: { endpoint: 'agents' },
        loadTools: async () => ({ tools: [], toolDefinitions: [] }),
      },
      { getFiles: async () => [], getConvoFiles: async () => [], updateFilesUsage: async () => [] },
    );
  const resolved = await resolveHostModelRouting({
    config: appConfig.endpoints.agents.hostModelRouting,
    originalAgent,
    primaryConfig: await initialize(originalAgent),
    initialize,
    validate: async () => ({ isValid: true }),
    resolveRuntimeProvider: (provider) =>
      getProviderConfig({ provider, appConfig }).overrideProvider,
    decide: decideHostModel,
    persist: async () => {},
    traceId: 'ci-config-trace',
    traceEventId: 'ci-config-event',
    decisionId: 'ci-config-decision',
    user: 'ci-config-only',
    timestamp: '2026-10-25T00:00:00Z',
  });
  assert.equal(resolved.model, originalAgent.model);
  assert.equal(resolved.hostModelDecision.selectedBindingId, 'controlled-primary');
  assert.equal(resolved.hostModelDecision.spendingPolicy, 'free_only');
  assert.equal(resolved.model_parameters.fallbacks.length, 1);
  const fallback = resolved.model_parameters.fallbacks[0];
  assert.equal(fallback.provider, 'openrouter');
  assert.equal(fallback.retryOn, 'MODEL_RATE_LIMIT_ZERO_CHUNK');
  assert.equal(fallback.clientOptions.model, 'nvidia/nemotron-3.5-super-vl:free');
  for (const options of [resolved.model_parameters, fallback.clientOptions]) {
    assert.equal(options.maxRetries, 0);
    assert.equal(options.maxTokens, 2048);
    assert.equal(options.timeout, 90000);
    assert.deepEqual(options.reasoning, { enabled: false });
    assert.equal(options.configuration.baseURL, 'http://fixture:8088/v1');
  }
  console.log('HOST_RESEARCH_FALLBACK_RUNTIME_BINDING=PASS');
  await validateFallbackWire(fallback);
}

async function validateFallbackWire(fallback) {
  const { createServer } = require('node:http');
  const { initializeModel } = require('@librechat/agents');
  let wireCalls = 0;
  let wireError;
  const server = createServer(async (req, res) => {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const sent = JSON.parse(raw);
      assert.equal(sent.model, fallback.clientOptions.model);
      assert.deepEqual(sent.reasoning, { enabled: false });
      assert.equal(sent.max_tokens, 2048);
      assert.equal(sent.models, undefined);
      assert.equal(sent.plugins, undefined);
      wireCalls++;
      const message = { role: 'assistant', content: 'controlled alias wire probe' };
      const reply = {
        id: 'local-alias',
        object: 'chat.completion',
        created: 1700000000,
        model: sent.model,
        choices: [{ index: 0, message, finish_reason: 'stop' }],
      };
      if (sent.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        reply.choices = [{ index: 0, delta: message, finish_reason: 'stop' }];
        res.end('data: ' + JSON.stringify(reply) + '\n\ndata: [DONE]\n\n');
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(reply));
      }
    } catch (error) {
      wireError = error;
      res.writeHead(400);
      res.end('CI alias wire mismatch');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    for (const streaming of [false, true]) {
      const model = initializeModel({
        provider: fallback.provider,
        clientOptions: {
          ...fallback.clientOptions,
          streaming,
          configuration: { baseURL: 'http://127.0.0.1:' + server.address().port + '/v1' },
        },
      });
      await model.invoke([{ role: 'user', content: 'Controlled local alias wire test' }]);
    }
    assert.ifError(wireError);
    assert.equal(wireCalls, 2);
  } catch (error) {
    throw wireError ?? error;
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  console.log('HOST_RESEARCH_FALLBACK_ACTUAL_WIRE=PASS');
}
