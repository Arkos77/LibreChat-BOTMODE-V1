const path = require('node:path');
const { createServer } = require('node:http');
const { Run } = require('@librechat/agents');
const { HumanMessage } = require('@librechat/agents/langchain/messages');
const {
  initializeAgent,
  getProviderConfig,
  decideHostModel,
  deterministicPlanner,
  compileNativePlan,
  assertTerminalMissionTasksVerified,
} = require('@librechat/api');
const { resolveHostModelRouting } = require('./hostModelRouting');
const { installJsonObserver, describeContent } = require(
  path.resolve(__dirname, '../../../../../scripts/botmode/ci-http-json-observer.cjs'),
);

describe('HTTP fallback output through the native graph and Oracle', () => {
  it.each([
    [false, true, false],
    [true, true, false],
    [false, false, false],
    [true, false, false],
    [true, true, true],
  ])(
    'preserves candidate bytes: streaming=%s valid=%s strictProvider=%s',
    async (streaming, valid, strictProvider) => {
      const supplied = [];
      const requests = [];
      const results = [];
      const decisions = [];
      const server = createServer(async (req, res) => {
        let body = '';
        for await (const chunk of req) body += chunk;
        const input = JSON.parse(body);
        requests.push(input);
        res.setHeader('Content-Type', 'application/json');
        if (input.model === 'primary:free') {
          res.writeHead(429);
          res.end(JSON.stringify({ error: { message: 'local quota', code: 429 } }));
          return;
        }
        if (input.model !== 'openrouter/free') {
          res.writeHead(400).end();
          return;
        }
        const candidate = valid
          ? JSON.stringify({ ok: true, fixture: supplied.length }).padEnd(59, ' ')
          : 'invalid-json-response'.padEnd(59, '.');
        supplied.push(candidate);
        const base = { id: `fixture-${requests.length}`, created: 1, model: input.model };
        if (input.stream === true) {
          res.setHeader('Content-Type', 'text/event-stream');
          for (const [delta, finish_reason] of [
            [{ role: 'assistant', content: candidate.slice(0, 7) }, null],
            [{ content: candidate.slice(7, 22) }, null],
            [{ content: candidate.slice(22) }, null],
            [{}, 'stop'],
          ]) {
            res.write(
              'data: ' +
                JSON.stringify({
                  ...base,
                  object: 'chat.completion.chunk',
                  choices: [{ index: 0, delta, finish_reason }],
                }) +
                '\n\n',
            );
          }
          res.end('data: [DONE]\n\n');
          return;
        }
        res.end(
          JSON.stringify({
            ...base,
            object: 'chat.completion',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: candidate },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
        );
      });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      let observer;
      const traces = [];
      try {
        const baseURL = `http://127.0.0.1:${server.address().port}/openrouter/v1`;
        observer = installJsonObserver({
          urls: [baseURL + '/chat/completions'],
          models: ['primary:free', 'openrouter/free'],
          onRecord: (record) => traces.push(record),
        });
        const endpoints = [
          { name: 'OpenRouter', models: { default: ['primary:free'] } },
          {
            name: 'FreeCompat',
            models: { default: ['openrouter/free'] },
            customParams: { defaultParamsEndpoint: 'openAI' },
          },
        ].map((endpoint) => ({
          ...endpoint,
          apiKey: 'fixture-only',
          baseURL,
          addParams: {
            response_format: { type: 'json_object' },
            maxRetries: 0,
            streaming,
            ...(strictProvider ? { provider: { require_parameters: true } } : {}),
          },
        }));
        const appConfig = { endpoints: { custom: endpoints } };
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
              allowedProviders: new Set(endpoints.map((endpoint) => endpoint.name)),
              endpointOption: { endpoint: 'agents' },
              loadTools: async () => ({ tools: [], toolDefinitions: [] }),
            },
            {
              getFiles: async () => [],
              getConvoFiles: async () => [],
              updateFilesUsage: async () => [],
            },
          );
        const bindings = new Map();
        for (const id of ['worker', 'specialist']) {
          const agent = {
            id,
            provider: 'OpenRouter',
            model: 'primary:free',
            tools: [],
            model_parameters: { model: 'primary:free' },
          };
          const resolved = await resolveHostModelRouting({
            config: [
              {
                agentId: id,
                bindings: [
                  { id: 'primary', provider: 'OpenRouter', model: 'primary:free' },
                  { id: 'fallback', provider: 'FreeCompat', model: 'openrouter/free' },
                ].map((binding) => ({
                  ...binding,
                  signals: { pricingTier: 'free', estimatedCost: 0 },
                })),
                preferredBindingId: 'primary',
                allowFailover: true,
                routingConstraints: { spendingPolicy: 'free_only' },
              },
            ],
            originalAgent: agent,
            primaryConfig: await initialize({ ...agent }),
            initialize,
            validate: async () => ({ isValid: true }),
            resolveRuntimeProvider: (provider) =>
              getProviderConfig({ provider, appConfig }).overrideProvider,
            decide: decideHostModel,
            persist: async (decision) => decisions.push(decision),
            traceId: 'fixture-trace',
            traceEventId: `fixture-event-${id}`,
            decisionId: `fixture-decision-${id}`,
            user: 'fixture-user',
            timestamp: '2026-10-23T00:00:00.000Z',
          });
          bindings.set(id, {
            agentId: id,
            provider: resolved.provider,
            clientOptions: resolved.model_parameters,
            instructions: 'Return only JSON: {"ok":true}',
          });
        }
        const context = {
          worker: {
            id: 'worker',
            agentId: 'worker',
            role: 'worker',
            capabilities: ['basic'],
            constraints: [],
          },
          specialists: [
            {
              id: 'specialist',
              agentId: 'specialist',
              role: 'specialist',
              capabilities: ['research'],
              constraints: [],
            },
          ],
        };
        const plan = deterministicPlanner.planMission(
          {
            missionId: 'fixture-five-tasks',
            taskId: 'fixture-root',
            objective: 'Verify native JSON transport',
            constraints: ['loopback only'],
            requiredCapabilities: ['basic', 'research'],
            objectives: Array.from({ length: 5 }, (_, index) => ({
              key: `task${index}`,
              objective: 'Return only JSON: {"ok":true}',
              requiredCapabilities: [index === 0 ? 'basic' : 'research'],
              dependsOn: index === 0 ? [] : [`task${index - 1}`],
            })),
            validation: { criteria: [{ id: 'ok', field: 'ok', expected: true }] },
          },
          context,
        );
        const persist = async (result) => results.push(result);
        const native = compileNativePlan(plan, bindings, undefined, undefined, persist);
        const run = await Run.create({
          runId: `wire-oracle-${streaming}-${valid}`,
          graphConfig: native.graphConfig,
        });
        const execution = run.processStream(
          { messages: [new HumanMessage('Return only JSON: {"ok":true}')] },
          { version: 'v2' },
        );
        if (valid) await execution;
        else await expect(execution).rejects.toThrow('Native mission Oracle blocked task');
        if (valid) {
          expect(run.getHaltReason()).toBeUndefined();
          await assertTerminalMissionTasksVerified(plan, run.getAgentOutputs(), undefined, persist);
          expect(results).toHaveLength(5);
          expect(
            results.every((result) =>
              result.verdicts.every((verdict) => verdict.status === 'VERIFIED'),
            ),
          ).toBe(true);
          expect(requests).toHaveLength(10);
        } else {
          expect(results).toHaveLength(1);
          expect(results[0].verdicts[0].status).toBe('REJECTED');
          expect(results[0].verdicts[0].reasons).toContainEqual({ code: 'INVALID_CANDIDATE' });
          expect(requests).toHaveLength(2);
        }
        expect(results.map((result) => result.verdicts[0].input.candidate)).toEqual(supplied);
        expect(results.every((result) => result.verdicts[0].input.candidate.length === 59)).toBe(
          true,
        );
        expect(requests.every((request) => request.response_format?.type === 'json_object')).toBe(
          true,
        );
        expect(decisions).toHaveLength(2);
        await observer.flush();
        expect(traces).toHaveLength(requests.length);
        const fallbackTraces = traces
          .filter((trace) => trace.status === 200)
          .sort((left, right) => left.sequence - right.sequence);
        expect(fallbackTraces).toHaveLength(valid ? 5 : 1);
        for (const [index, trace] of fallbackTraces.entries()) {
          expect(trace.request).toMatchObject({
            model: 'openrouter/free',
            jsonObjectRequested: true,
          });
          expect(trace.response).toMatchObject({
            model: 'openrouter/free',
            finishReason: 'stop',
            protocolError: false,
          });
          expect(trace.response.content).toEqual(describeContent(supplied[index]));
          expect(trace.request.requireParameters).toBe(strictProvider);
        }
        for (const [index, result] of results.entries()) {
          expect(fallbackTraces[index].response.content.sha256).toBe(
            describeContent(result.verdicts[0].input.candidate).sha256,
          );
        }
        expect(JSON.stringify(traces)).not.toContain('fixture-only');
        for (const candidate of supplied) expect(JSON.stringify(traces)).not.toContain(candidate);
      } finally {
        if (observer) {
          await observer.flush();
          observer.restore();
        }
        await new Promise((resolve) => server.close(resolve));
      }
    },
  );
});
