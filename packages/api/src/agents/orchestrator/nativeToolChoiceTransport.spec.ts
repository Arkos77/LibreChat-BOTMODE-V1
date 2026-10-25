import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';
import { Run, Providers } from '@librechat/agents';
import { HumanMessage } from '@librechat/agents/langchain/messages';
import { DynamicStructuredTool } from '@librechat/agents/langchain/tools';
import { deterministicPlanner } from './planner';
import { prepareBotModeMission } from './output';
import { compileNativePlan } from './native';
import { validateMissionTask, assertMissionTaskVerified } from './missionOracle';
import type { OracleSourceObservation } from '../oracle';

it.each(['success', 'prose', 'tool-error', 'fallback429'])(
  'executes native research phases over real SDK HTTP: %s',
  async (mode) => {
    const requests: Array<{ choice: unknown; hasToolResult: boolean; format: unknown }> = [];
    const primaryChoices: unknown[] = [];
    const observed: OracleSourceObservation[] = [];
    let executed = 0;
    const candidate = JSON.stringify({
      ok: true,
      result: 'Controlled source https://example.invalid/report',
      sources: 'https://example.invalid/report',
    });
    const server = createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += chunk;
      const input = JSON.parse(body);
      const hasToolResult = input.messages.some(
        (message: { role: string }) => message.role === 'tool',
      );
      if (req.url?.startsWith('/primary/')) {
        primaryChoices.push(input.tool_choice);
        res.writeHead(429, { 'content-type': 'application/json' }).end(
          JSON.stringify({
            error: {
              message: 'controlled rate limit',
              type: 'rate_limit_exceeded',
              code: 'rate_limit_exceeded',
            },
          }),
        );
        return;
      }
      requests.push({ choice: input.tool_choice, hasToolResult, format: input.response_format });
      if (
        input.tool_choice == null ||
        !input.tools?.some(
          (tool: { function?: { name: string } }) => tool.function?.name === 'web_search',
        )
      ) {
        res.writeHead(400, { 'content-type': 'application/json' }).end(
          JSON.stringify({
            error: {
              message: 'tools and explicit tool_choice required',
              type: 'invalid_request_error',
            },
          }),
        );
        return;
      }
      res.writeHead(200, { 'content-type': 'text/event-stream', connection: 'close' });
      const send = (delta: Record<string, unknown>, finish_reason: string | null = null) =>
        res.write(
          'data: ' +
            JSON.stringify({
              id: `local-choice-${requests.length}`,
              object: 'chat.completion.chunk',
              created: 1700000000,
              model: 'offline:free',
              choices: [{ index: 0, delta, finish_reason }],
            }) +
            '\n\n',
        );
      send({ role: 'assistant' });
      if (mode === 'prose' && !hasToolResult) {
        send({ content: 'Je vais lancer les recherches officielles.' });
        send({}, 'stop');
      } else if (!hasToolResult) {
        send({
          tool_calls: [
            {
              index: 0,
              id: 'observed-search',
              type: 'function',
              function: { name: 'web_search', arguments: '{"query":"controlled source"}' },
            },
          ],
        });
        send({}, 'tool_calls');
      } else {
        send({ content: candidate });
        send({}, 'stop');
      }
      res.end('data: [DONE]\n\n');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const tool = new DynamicStructuredTool({
        name: 'web_search',
        description: 'Controlled local search',
        schema: z.object({ query: z.string() }),
        func: async () => {
          executed++;
          if (mode === 'tool-error') throw new Error('controlled tool refusal');
          observed.push({
            toolCallId: 'observed-search',
            urls: ['https://example.invalid/report'],
          });
          return 'Controlled source https://example.invalid/report';
        },
      });
      const plan = deterministicPlanner.planMission(
        prepareBotModeMission({
          missionId: 'native-choice',
          taskId: 'root',
          objective: 'Controlled research',
          requiredCapabilities: ['web_search'],
          constraints: [],
        }),
        {
          worker: {
            id: 'worker',
            agentId: 'saved-worker',
            role: 'worker',
            capabilities: ['web_search'],
            constraints: [],
          },
          specialists: [],
        },
      );
      const native = compileNativePlan(
        plan,
        new Map([
          [
            'saved-worker',
            {
              agentId: 'saved-worker',
              provider: Providers.OPENAI,
              tools: [tool],
              clientOptions: {
                model: 'offline:free',
                apiKey: 'local-fake-key',
                maxRetries: 0,
                configuration: {
                  baseURL: `http://127.0.0.1:${(server.address() as AddressInfo).port}/${mode === 'fallback429' ? 'primary/v1' : 'v1'}`,
                },
                ...(mode === 'fallback429' && {
                  fallbacks: [
                    {
                      provider: Providers.OPENAI,
                      clientOptions: {
                        model: 'offline:free',
                        apiKey: 'local-fake-key',
                        maxRetries: 0,
                        configuration: {
                          baseURL: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
                        },
                      },
                      retryOn: 'MODEL_RATE_LIMIT_ZERO_CHUNK',
                    },
                  ],
                }),
              },
            },
          ],
        ]),
      );
      const run = await Run.create({
        runId: 'native-tool-choice',
        graphConfig: native.graphConfig,
      });
      if (mode === 'prose' || mode === 'tool-error') {
        await expect(
          run.processStream(
            { messages: [new HumanMessage('Research the controlled source')] },
            { version: 'v2' },
          ),
        ).rejects.toThrow();
        expect(requests).toHaveLength(1);
        expect(executed).toBe(mode === 'prose' ? 0 : 1);
        return;
      }
      await run.processStream(
        { messages: [new HumanMessage('Research the controlled source')] },
        { version: 'v2' },
      );
      expect(requests).toEqual([
        {
          choice: { type: 'function', function: { name: 'web_search' } },
          hasToolResult: false,
          format: undefined,
        },
        {
          choice: 'auto',
          hasToolResult: true,
          format: expect.objectContaining({
            type: 'json_schema',
            json_schema: expect.objectContaining({
              strict: true,
              schema: expect.objectContaining({
                required: ['result', 'sources', 'ok'],
                additionalProperties: false,
              }),
            }),
          }),
        },
      ]);
      expect(executed).toBe(1);
      if (mode === 'fallback429')
        expect(primaryChoices).toEqual(requests.map((request) => request.choice));
      const task = plan.tasks[0];
      const output = run.getAgentOutputs()[task.nodeId];
      expect(output.content).toBe(candidate);
      const verdict = await validateMissionTask({
        taskId: task.taskId,
        nodeId: task.nodeId,
        agentId: task.agentId,
        candidate: output.content as string,
        requirements: task.validation,
        observedSources: observed,
      });
      expect(() => assertMissionTaskVerified(verdict)).not.toThrow();
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
  20000,
);
