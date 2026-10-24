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

it('sends tools with explicit auto on both native HTTP turns and verifies the observed research', async () => {
  const requests: Array<{ choice: unknown; hasToolResult: boolean }> = [];
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
    requests.push({ choice: input.tool_choice, hasToolResult });
    if (
      input.tool_choice !== 'auto' ||
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
            id: 'local-choice',
            object: 'chat.completion.chunk',
            created: 1700000000,
            model: 'offline:free',
            choices: [{ index: 0, delta, finish_reason }],
          }) +
          '\n\n',
      );
    send({ role: 'assistant' });
    if (!hasToolResult) {
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
        observed.push({ toolCallId: 'observed-search', urls: ['https://example.invalid/report'] });
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
                baseURL: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
              },
            },
          },
        ],
      ]),
    );
    const run = await Run.create({ runId: 'native-tool-choice', graphConfig: native.graphConfig });
    await run.processStream(
      { messages: [new HumanMessage('Research the controlled source')] },
      { version: 'v2' },
    );
    expect(requests).toEqual([
      { choice: 'auto', hasToolResult: false },
      { choice: 'auto', hasToolResult: true },
    ]);
    expect(executed).toBe(1);
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
}, 20000);
