import { Run, Providers } from '@librechat/agents';
import { createServer } from 'node:http';
import { z } from 'zod';
import { HumanMessage } from '@librechat/agents/langchain/messages';
import { DynamicStructuredTool } from '@librechat/agents/langchain/tools';
import type { AgentInputs, OpenAIClientOptions, FallbackConfig } from '@librechat/agents';
import type { Mission, OracleRequirement } from './types';
import type OpenAI from 'openai';
import { deterministicPlanner } from './planner';
import { prepareBotModeMission } from './output';
import { validateMissionTask } from './missionOracle';
import { compileNativePlan } from './native';

const mission: Mission = {
  missionId: 'structured-output',
  taskId: 'root',
  objective: 'Read the controlled report',
  constraints: [],
  requiredCapabilities: ['basic'],
};
const context = {
  worker: {
    id: 'worker',
    agentId: 'saved',
    role: 'worker',
    capabilities: ['basic', 'web_search'],
    constraints: [],
  },
  specialists: [],
};
const planFor = (research = false, validation?: OracleRequirement) =>
  deterministicPlanner.planMission(
    prepareBotModeMission({
      ...mission,
      ...(validation && { validation }),
      requiredCapabilities: [research ? 'web_search' : 'basic'],
    }),
    context,
  );
const binding: AgentInputs = {
  agentId: 'saved',
  provider: Providers.OPENROUTER,
  toolDefinitions: [{ name: 'web_search' }],
  clientOptions: { model: 'openrouter/free', maxTokens: 2048, maxRetries: 0 },
};
const resultOptions = (
  input: AgentInputs = binding,
  research = false,
  validation?: OracleRequirement,
) => {
  const actors = compileNativePlan(planFor(research, validation), new Map([['saved', input]]))
    .graphConfig.agents;
  return actors[actors.length - 1].clientOptions as OpenAIClientOptions & {
    fallbacks?: FallbackConfig[];
  };
};

describe('native structured output transport', () => {
  it.each([false, true])(
    'requires the actual output fields without forcing success, research=%s',
    (research) => {
      const original = structuredClone(binding.clientOptions);
      const options = resultOptions(binding, research);
      expect(options.modelKwargs?.response_format).toEqual({
        type: 'json_schema',
        json_schema: {
          name: research ? 'botmode_research_v1' : 'botmode_result_v1',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              result: { type: 'string', description: expect.any(String) },
              ...(research && { sources: { type: 'string', description: expect.any(String) } }),
              ok: { type: ['boolean', 'null'] },
            },
            required: research ? ['result', 'sources', 'ok'] : ['result', 'ok'],
            additionalProperties: false,
          },
        },
      });
      expect(options).toMatchObject({
        model: 'openrouter/free',
        maxTokens: 2048,
        maxRetries: 0,
        modelKwargs: { provider: { require_parameters: true } },
      });
      expect(binding.clientOptions).toEqual(original);
    },
  );

  it('describes criterion types and uncertainty rather than embedding expected values', () => {
    const options = resultOptions(binding, false, {
      criteria: [
        { id: 'state', field: 'state', expected: 'done' },
        { id: 'count', field: 'count', expected: 2 },
        { id: 'unknown', field: 'unknown', expected: null },
      ],
    });
    const schema = options.modelKwargs?.response_format.json_schema.schema;
    expect(schema.properties).toMatchObject({
      state: { type: ['string', 'null'] },
      count: { type: ['number', 'null'] },
      unknown: { type: ['string', 'number', 'boolean', 'null'] },
      ok: { type: ['boolean', 'null'] },
    });
    expect(JSON.stringify(schema)).not.toMatch(/"(?:const|enum)"/);
  });

  it.each(['text', 'json_object'])(
    'upgrades %s transport without changing the saved route',
    (type) => {
      const options = { model: 'openrouter/free', modelKwargs: { response_format: { type } } };
      expect(resultOptions({ ...binding, clientOptions: options }, true)).toMatchObject({
        model: 'openrouter/free',
        modelKwargs: { response_format: { type: 'json_schema' } },
      });
      expect(options.modelKwargs.response_format.type).toBe(type);
    },
  );

  it.each(['malformed', []])(
    'rejects malformed native provider preferences before inference',
    (provider) => {
      expect(() =>
        resultOptions({ ...binding, clientOptions: { modelKwargs: { provider } } }),
      ).toThrow('BOTMODE_PROVIDER_PARAMETERS_INVALID');
    },
  );

  it('keeps an explicit owner schema and provider preferences without mutating inputs', () => {
    const format = {
      type: 'json_schema',
      json_schema: {
        name: 'owner',
        strict: true,
        schema: {
          type: 'object',
          properties: { result: { type: 'string' } },
          required: ['result'],
          additionalProperties: false,
        },
      },
    };
    const options = {
      model: 'openrouter/free',
      modelKwargs: {
        response_format: format,
        provider: {
          order: ['chosen-provider'],
          max_price: { prompt: 0 },
          require_parameters: false,
        },
      },
    };
    const actual = resultOptions({ ...binding, clientOptions: options });
    expect(actual.modelKwargs?.response_format).toEqual(format);
    expect(actual.modelKwargs?.provider).toEqual({
      order: ['chosen-provider'],
      max_price: { prompt: 0 },
      require_parameters: true,
    });
    expect(options.modelKwargs.provider.require_parameters).toBe(false);
  });

  it('applies the result schema to fallbacks without changing providers, models or retry policy', () => {
    const fallback: FallbackConfig = {
      provider: Providers.OPENROUTER,
      clientOptions: { model: 'chosen/model:free', maxRetries: 0 },
      retryOn: 'MODEL_RATE_LIMIT_ZERO_CHUNK',
    };
    const options: OpenAIClientOptions & { fallbacks: FallbackConfig[] } = {
      model: 'openrouter/free',
      fallbacks: [fallback],
    };
    const result = resultOptions({ ...binding, clientOptions: options });
    expect(result.fallbacks?.[0]).toMatchObject({
      provider: Providers.OPENROUTER,
      retryOn: fallback.retryOn,
      clientOptions: {
        model: 'chosen/model:free',
        maxRetries: 0,
        modelKwargs: {
          response_format: { type: 'json_schema' },
          provider: { require_parameters: true },
        },
      },
    });
    expect(fallback.clientOptions).not.toHaveProperty('modelKwargs');
  });

  it('does not add Chat Completions options to Responses API or unsupported providers', () => {
    for (const input of [
      { ...binding, clientOptions: { model: 'saved', useResponsesApi: true } },
      { ...binding, provider: Providers.ANTHROPIC, clientOptions: { model: 'saved' } },
    ]) {
      expect(resultOptions(input)).toEqual(input.clientOptions);
    }
  });

  it('lets a null expectation report actual non-null outcomes that Oracle must reject', async () => {
    const validation: OracleRequirement = {
      criteria: [{ id: 'no-error', field: 'error', expected: null }],
    };
    const options = resultOptions(binding, false, validation);
    const types = options.modelKwargs?.response_format.json_schema.schema.properties.error.type;
    expect(types).toEqual(expect.arrayContaining(['string', 'number', 'boolean', 'null']));
    const task = planFor(false, validation).tasks[0];
    for (const error of ['Observed failure', 1, false]) {
      const actual = await validateMissionTask({
        taskId: task.taskId,
        nodeId: task.nodeId,
        agentId: task.agentId,
        candidate: JSON.stringify({ ok: true, result: 'Actual outcome', error }),
        requirements: task.validation,
      });
      expect(actual.verdicts[0].status).toBe('REJECTED');
      expect(actual.verdicts[0].reasons).toContainEqual({
        code: 'CRITERION_FAILED',
        criterionId: 'no-error',
      });
    }
  });

  it('still rejects the captured query-only result with the actual Oracle', async () => {
    const plan = planFor(true);
    const task = plan.tasks[0];
    const actual = await validateMissionTask({
      taskId: task.taskId,
      nodeId: task.nodeId,
      agentId: task.agentId,
      candidate: '{"query":"CI source code repository continuous integration git source"}',
      requirements: task.validation,
      observedSources: [{ toolCallId: 'search', urls: ['https://ci-source.invalid/report'] }],
    });
    expect(actual.verdicts.every((v) => v.status === 'REJECTED')).toBe(true);
    expect(actual.verdicts.flatMap((v) => v.reasons)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CRITERION_FAILED', criterionId: 'output:result' }),
        expect.objectContaining({ code: 'CRITERION_FAILED', criterionId: 'output:sources' }),
      ]),
    );
  });

  it.each([false, true])(
    'emits the contract through native SDK HTTP, fallback=%s',
    async (fallback) => {
      type Payload = OpenAI.Chat.ChatCompletionCreateParams & {
        provider?: { require_parameters?: boolean };
      };
      const received: Array<{ primary: boolean; body: Payload }> = [];
      const source = 'https://ci-source.invalid/report';
      const candidate = JSON.stringify({
        ok: true,
        result: 'Controlled report ' + source,
        sources: source,
      });
      let sourcesReady = false;
      let effects = 0;
      let handlerError: Error | undefined;
      const server = createServer(async (request, response) => {
        try {
          let input = '';
          for await (const chunk of request) input += chunk;
          const body: Payload = JSON.parse(input);
          const primary = request.url?.startsWith('/primary/') === true;
          received.push({ primary, body });
          if (primary && fallback) {
            response.writeHead(429, { 'content-type': 'application/json' });
            response.end(
              '{"error":{"message":"Controlled rate limit","type":"rate_limit_exceeded"}}',
            );
            return;
          }
          const result = body.messages.some((message) => message.role === 'tool');
          if (result && !sourcesReady)
            throw new Error('Source barrier did not precede result HTTP');
          response.writeHead(200, { 'content-type': 'text/event-stream', connection: 'close' });
          const emit = (delta: object, finish_reason: string | null = null) =>
            response.write(
              'data: ' +
                JSON.stringify({
                  id: 'local-' + received.length,
                  object: 'chat.completion.chunk',
                  created: 1700000000,
                  model: 'synthetic-resolved:free',
                  choices: [{ index: 0, delta, finish_reason }],
                }) +
                '\n\n',
            );
          emit({ role: 'assistant' });
          if (result) {
            emit({ content: candidate });
            emit({}, 'stop');
          } else {
            emit({
              tool_calls: [
                {
                  index: 0,
                  id: 'observed-search',
                  type: 'function',
                  function: { name: 'web_search', arguments: '{"query":"controlled report"}' },
                },
              ],
            });
            emit({}, 'tool_calls');
          }
          response.end('data: [DONE]\n\n');
        } catch (error) {
          handlerError = error instanceof Error ? error : new Error(String(error));
          response.destroy();
        }
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No loopback address');
      try {
        const options = (route: string): OpenAIClientOptions => ({
          model: 'openrouter/free',
          apiKey: 'local-fake-key',
          maxRetries: 0,
          maxTokens: 2048,
          timeout: 3000,
          configuration: { baseURL: `http://127.0.0.1:${address.port}/${route}/v1` },
        });
        const tool = new DynamicStructuredTool({
          name: 'web_search',
          description: 'Controlled source',
          schema: z.object({ query: z.string() }),
          func: async () => {
            effects++;
            return source;
          },
        });
        const clientOptions: OpenAIClientOptions & { fallbacks?: FallbackConfig[] } = {
          ...options('primary'),
          ...(fallback && {
            fallbacks: [
              {
                provider: Providers.OPENROUTER,
                clientOptions: options('secondary'),
                retryOn: 'MODEL_RATE_LIMIT_ZERO_CHUNK',
              },
            ],
          }),
        };
        const input: AgentInputs = {
          ...binding,
          toolDefinitions: undefined,
          tools: [tool],
          clientOptions,
          subagentConfigs: [
            {
              type: 'authorized-self',
              name: 'Authorized context',
              self: true,
              description: 'Authorized focused context',
            },
          ],
        };
        const plan = planFor(true);
        const compiled = compileNativePlan(
          plan,
          new Map([['saved', input]]),
          undefined,
          undefined,
          undefined,
          async () => {
            sourcesReady = effects === 1;
            return [{ toolCallId: 'observed-search', urls: [source] }];
          },
        );
        const run = await Run.create({
          runId: `schema-${fallback}`,
          graphConfig: compiled.graphConfig,
        });
        await run.processStream(
          { messages: [new HumanMessage('Read the controlled report')] },
          { version: 'v2', recursionLimit: 12 },
        );
        expect(handlerError).toBeUndefined();
        expect(effects).toBe(1);
        const completed = received
          .filter((request) => !fallback || !request.primary)
          .map((request) => request.body);
        expect(completed).toHaveLength(2);
        for (const request of received) {
          expect(request.body).toMatchObject({
            model: 'openrouter/free',
            max_tokens: 2048,
            provider: { require_parameters: true },
          });
        }
        expect(completed[0]).not.toHaveProperty('response_format');
        expect(completed[0].tool_choice).toEqual({
          type: 'function',
          function: { name: 'web_search' },
        });
        expect(
          completed[0].tools?.map((tool) =>
            tool.type === 'function' ? tool.function.name : tool.type,
          ),
        ).toEqual(['web_search']);
        expect(completed[1].response_format).toMatchObject({
          type: 'json_schema',
          json_schema: {
            strict: true,
            schema: { required: ['result', 'sources', 'ok'], additionalProperties: false },
          },
        });
        expect(completed[1].tool_choice).toBe('auto');
        const resultTools = completed[1].tools?.map((tool) =>
          tool.type === 'function' ? tool.function.name : tool.type,
        );
        expect(resultTools).toContain('web_search');
        if (!fallback) expect(resultTools).toContain('subagent');
        expect(run.getAgentOutputs()[plan.tasks[0].nodeId].content).toBe(candidate);
        if (fallback) expect(received.filter((request) => request.primary)).toHaveLength(2);
        expect(clientOptions.modelKwargs).toBeUndefined();
      } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    },
    20000,
  );
});
