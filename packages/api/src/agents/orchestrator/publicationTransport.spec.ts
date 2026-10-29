import { z } from 'zod';
import { createServer } from 'node:http';
import { Run, Providers } from '@librechat/agents';
import { HumanMessage } from '@librechat/agents/langchain/messages';
import { DynamicStructuredTool } from '@librechat/agents/langchain/tools';
import type { MissionOracleState } from './missionOracle';
import {
  assertTerminalMissionTasksVerified,
  normalizeMissionOracleState,
  promoteTransientMissionOracleEvidence,
} from './missionOracle';
import { buildWebSearchContext } from '~/tools/toolkits/web';
import { renderMissionPublication } from './publication';
import { deterministicPlanner } from './planner';
import { prepareBotModeMission } from './output';
import { compileNativePlan } from './native';

it('carries verified research into analysis and synthesis through native SDK HTTP before rendering', async () => {
  const source = 'https://ci-source.invalid/report';
  const requests: Array<{ format?: string; messages: string }> = [];
  let handlerError: Error | undefined;
  const plan = deterministicPlanner.planMission(
    prepareBotModeMission(
      {
        missionId: 'v2-transport',
        taskId: 'root',
        objective: 'Research, analyze, synthesize',
        constraints: [],
        requiredCapabilities: ['web_search', 'analysis', 'writing'],
        objectives: [
          {
            key: 'research',
            objective: 'Find the report',
            requiredCapabilities: ['web_search'],
            dependsOn: [],
          },
          {
            key: 'analysis',
            objective: 'Analyze the report',
            requiredCapabilities: ['analysis'],
            dependsOn: ['research'],
          },
          {
            key: 'synthesis',
            objective: 'Synthesize the report',
            requiredCapabilities: ['writing'],
            dependsOn: ['analysis'],
          },
        ],
      },
      { researchContract: 'research-v2' },
    ),
    {
      worker: {
        id: 'worker',
        agentId: 'saved',
        role: 'worker',
        capabilities: ['web_search', 'analysis', 'writing'],
        constraints: [],
      },
      specialists: [],
    },
  );
  let state: MissionOracleState = { evidence: {}, results: {} };
  const server = createServer(async (req, res) => {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      const messages = JSON.stringify(body.messages);
      const n = requests.length;
      requests.push({ format: body.response_format?.json_schema?.name, messages });
      expect(body.model).toBe('offline:free');
      expect(body.max_tokens).toBe(2048);
      expect(body.provider.require_parameters).toBe(true);
      if (n < 2) {
        expect(messages).toContain('INTERNAL RESEARCH OUTPUT');
        expect(messages).toContain('you do not need to repeat those URLs in result');
        expect(messages).not.toContain('Reproduce each cited observed URL literally');
      }
      if (n >= 2) {
        expect(messages).toContain(source);
        expect(
          state.results[plan.tasks[n - 2].taskId].verdicts.every((v) => v.status === 'VERIFIED'),
        ).toBe(true);
      }
      res.writeHead(200, { 'content-type': 'text/event-stream', connection: 'close' });
      const send = (delta: object, finish_reason: string | null = null) =>
        res.write(
          'data: ' +
            JSON.stringify({
              id: 'v2-' + n,
              object: 'chat.completion.chunk',
              created: 1700000000,
              model: 'offline:free',
              choices: [{ index: 0, delta, finish_reason }],
            }) +
            '\n\n',
        );
      send({ role: 'assistant' });
      if (n === 0) {
        send({
          tool_calls: [
            {
              index: 0,
              id: 'native-search',
              type: 'function',
              function: { name: 'web_search', arguments: '{"query":"report"}' },
            },
          ],
        });
        send({}, 'tool_calls');
      } else {
        send({
          content: JSON.stringify({
            ok: true,
            result: n === 3 ? 'Final controlled synthesis.' : 'Three checks passed.',
            ...(n === 1 && { sources: source }),
          }),
        });
        send({}, 'stop');
      }
      res.end('data: [DONE]\n\n');
    } catch (error) {
      handlerError = error instanceof Error ? error : new Error(String(error));
      res.destroy();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No local port');
  try {
    const tool = new DynamicStructuredTool({
      name: 'web_search',
      description: 'Controlled report',
      schema: z.object({ query: z.string() }),
      func: async () => {
        state = promoteTransientMissionOracleEvidence(plan, state, {
          source: 'native_tool_end',
          toolCallId: 'native-search',
          toolName: 'web_search',
          producerAgentId: 'saved',
          taskId: plan.tasks[0].taskId,
          sourceUrls: [source],
        });
        state = normalizeMissionOracleState(JSON.parse(JSON.stringify(state)));
        return 'Controlled report: three checks passed. ' + source;
      },
    });
    const compiled = compileNativePlan(
      plan,
      new Map([
        [
          'saved',
          {
            agentId: 'saved',
            provider: Providers.OPENROUTER,
            instructions: buildWebSearchContext(),
            tools: [tool],
            clientOptions: {
              model: 'offline:free',
              apiKey: 'not-a-real-key',
              maxTokens: 2048,
              maxRetries: 0,
              timeout: 3000,
              configuration: { baseURL: `http://127.0.0.1:${address.port}/v1` },
            },
          },
        ],
      ]),
      undefined,
      undefined,
      async (result) => {
        state.results[result.taskId] = result;
        state = normalizeMissionOracleState(JSON.parse(JSON.stringify(state)));
      },
      (taskId) => state.sources?.[taskId] ?? [],
    );
    const run = await Run.create({ runId: 'v2-pipeline', graphConfig: compiled.graphConfig });
    await run.processStream(
      { messages: [new HumanMessage('Read, analyze and synthesize the controlled report')] },
      { version: 'v2', recursionLimit: 20 },
    );
    await assertTerminalMissionTasksVerified(plan, run.getAgentOutputs(), state, (result) => {
      state.results[result.taskId] = result;
    });
    expect(handlerError).toBeUndefined();
    expect(requests.map((r) => r.format)).toEqual([
      undefined,
      'botmode_research_v2',
      'botmode_result_v1',
      'botmode_result_v1',
    ]);
    expect(Object.values(state.results).flatMap((r) => r.verdicts)).toHaveLength(4);
    const raw = JSON.stringify(run.getAgentOutputs());
    expect(await renderMissionPublication(plan, state)).toBe(
      'Final controlled synthesis.\n\nSources\n- <' + source + '>',
    );
    expect(
      await renderMissionPublication(
        plan,
        normalizeMissionOracleState(JSON.parse(JSON.stringify(state))),
      ),
    ).toBe(await renderMissionPublication(plan, state));
    expect(JSON.stringify(run.getAgentOutputs())).toBe(raw);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}, 20000);
