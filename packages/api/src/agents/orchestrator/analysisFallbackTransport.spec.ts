import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';
import { Providers, Run } from '@librechat/agents';
import { HumanMessage } from '@librechat/agents/langchain/messages';
import { DynamicStructuredTool } from '@librechat/agents/langchain/tools';
import { deterministicPlanner } from './planner';
import { compileNativePlan } from './native';
import { assertMissionTaskVerified, validateMissionTask } from './missionOracle';

it('keeps analysis context identical after a zero-chunk 429 with a host graph tool', async () => {
  const requests: Record<string, unknown>[] = [];
  const candidate = JSON.stringify({ ok: true, result: 'Controlled analysis only.' });
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const input = JSON.parse(raw);
    requests.push(input);
    if (input.model === 'openrouter/free') {
      res.writeHead(429, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({ error: { message: 'controlled quota', type: 'rate_limit_exceeded' } }),
      );
      return;
    }
    res.writeHead(200, { 'content-type': 'text/event-stream', connection: 'close' });
    res.end(
      'data: ' +
        JSON.stringify({
          id: 'analysis-local',
          object: 'chat.completion.chunk',
          created: 1700000000,
          model: input.model,
          choices: [
            { index: 0, delta: { role: 'assistant', content: candidate }, finish_reason: 'stop' },
          ],
        }) +
        '\n\ndata: [DONE]\n\n',
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const plan = deterministicPlanner.planMission(
      {
        missionId: 'analysis-fallback',
        taskId: 'analysis',
        objective: 'Controlled analysis',
        requiredCapabilities: ['analysis'],
        constraints: ['offline'],
        validation: {
          criteria: [{ id: 'completed', field: 'ok', expected: true }],
          outputContract: 'result-v1',
        },
      },
      {
        worker: {
          id: 'analysis',
          agentId: 'analysis',
          role: 'analysis',
          capabilities: ['analysis'],
          constraints: [],
        },
        specialists: [],
      },
    );
    const control = new DynamicStructuredTool({
      name: 'check_background_task',
      description: 'Authorized host task control',
      schema: z.object({}),
      func: async () => {
        throw new Error('No background task was requested');
      },
    });
    const options = (model: string) => ({
      model,
      apiKey: 'local-fixture-only',
      maxRetries: 0,
      timeout: 3000,
      reasoning: { enabled: false },
      promptCache: true,
      configuration: { baseURL: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1` },
    });
    const native = compileNativePlan(
      plan,
      new Map([
        [
          'analysis',
          {
            agentId: 'analysis',
            provider: Providers.OPENROUTER,
            instructions: 'Controlled analysis policy',
            tools: [],
            graphTools: [control],
            clientOptions: {
              ...options('openrouter/free'),
              fallbacks: [
                {
                  provider: Providers.OPENROUTER,
                  clientOptions: options('nvidia/nemotron-3.5-super-vl:free'),
                  retryOn: 'MODEL_RATE_LIMIT_ZERO_CHUNK',
                },
              ],
            },
          },
        ],
      ]),
    );
    const run = await Run.create({ runId: 'analysis-local', graphConfig: native.graphConfig });
    await run.processStream(
      { messages: [new HumanMessage('Controlled analysis')] },
      { version: 'v2' },
    );
    expect(requests).toHaveLength(2);
    const selected = (request: Record<string, unknown>) =>
      Object.fromEntries(
        ['messages', 'tools', 'tool_choice', 'response_format'].map((key) => [
          key,
          request[key] ?? null,
        ]),
      );
    expect(requests[0].tool_choice).toBe('auto');
    expect(selected(requests[1])).toEqual(selected(requests[0]));
    expect(requests[1].tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          function: expect.objectContaining({ name: 'check_background_task' }),
        }),
      ]),
    );
    const task = plan.tasks[0];
    const output = run.getAgentOutputs()[task.nodeId];
    expect(output.content).toBe(candidate);
    assertMissionTaskVerified(
      await validateMissionTask({
        taskId: task.taskId,
        nodeId: task.nodeId,
        agentId: task.agentId,
        candidate,
        requirements: task.validation,
      }),
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}, 15000);
