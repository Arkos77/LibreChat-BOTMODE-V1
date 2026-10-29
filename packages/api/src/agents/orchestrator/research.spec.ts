import { z } from 'zod';
import { Run, Providers } from '@librechat/agents';
import { MemorySaver, Command } from '@langchain/langgraph';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { DynamicStructuredTool } from '@librechat/agents/langchain/tools';
import {
  AIMessage,
  ToolMessage,
  HumanMessage,
  AIMessageChunk,
} from '@librechat/agents/langchain/messages';
import type {
  AgentInputs,
  BaseGraphState,
  OpenAIClientOptions,
  FallbackConfig,
} from '@librechat/agents';
import {
  createMissionEvidenceContext,
  resolveNativeMissionToolAgentId,
  assertNativeMissionPhaseTools,
} from './evidenceContext';
import {
  researchObservationNodeId,
  researchPhaseBinding,
  requireResearchObservation,
} from './research';
import { buildWebSearchContext } from '~/tools/toolkits/web';
import { createToolExecuteHandler } from '../handlers';
import { buildHITLRunWiring } from '../hitl/runtime';
import { deterministicPlanner } from './planner';
import { prepareBotModeMission } from './output';
import { compileNativePlan } from './native';

const plan = deterministicPlanner.planMission(
  prepareBotModeMission({
    missionId: 'phase-mission',
    taskId: 'root',
    objective: 'Research',
    requiredCapabilities: ['web_search'],
    constraints: [],
  }),
  {
    worker: {
      id: 'worker',
      agentId: 'saved',
      role: 'worker',
      capabilities: ['web_search'],
      constraints: [],
    },
    specialists: [],
  },
);
const task = plan.tasks[0];
const binding: AgentInputs = {
  agentId: 'saved',
  provider: Providers.OPENAI,
  toolDefinitions: [{ name: 'web_search' }, { name: 'unrelated_tool' }],
  clientOptions: { model: 'local', modelKwargs: { response_format: { type: 'json_object' } } },
};

function state(status: 'success' | 'error' = 'success'): BaseGraphState {
  const ai = new AIMessage({
    id: 'phase-ai',
    content: '',
    tool_calls: [{ id: 'current-call', name: 'web_search', args: { query: 'source' } }],
  });
  return {
    messages: [
      ai,
      new ToolMessage({
        id: 'phase-tool',
        tool_call_id: 'current-call',
        name: 'web_search',
        content: 'observed source',
        status,
      }),
    ],
    agentOutputs: { [researchObservationNodeId(task.nodeId)]: ai },
  };
}

describe('native research phases', () => {
  it('compiles two native nodes of the same task with a guarded transition', () => {
    const native = compileNativePlan(plan, new Map([['saved', binding]]));
    expect(native.graphConfig.type).toBe('multi-agent');
    expect(native.graphConfig.agents.map((agent) => agent.agentId)).toEqual([
      researchObservationNodeId(task.nodeId),
      task.nodeId,
    ]);
    expect(native.graphConfig.agents[0].toolEnd).toBe(true);
    expect(native.graphConfig.agents[1].toolEnd).toBe(false);
    expect(native.actors).toEqual([
      { nodeId: researchObservationNodeId(task.nodeId), taskId: task.taskId, agentId: 'saved' },
      { nodeId: task.nodeId, taskId: task.taskId, agentId: 'saved' },
    ]);
    expect(native.validation).toHaveLength(1);
  });

  it('refuses unversioned research plans before compiling a different checkpoint topology', () => {
    const legacy = structuredClone(plan);
    delete legacy.mission.researchExecutionVersion;
    expect(() => compileNativePlan(legacy, new Map([['saved', binding]]))).toThrow(
      'BOTMODE_RESEARCH_PLAN_VERSION_UNSUPPORTED',
    );
    expect(() =>
      assertNativeMissionPhaseTools(legacy, researchObservationNodeId(task.nodeId), ['web_search']),
    ).toThrow('BOTMODE_RESEARCH_PHASE_CONTEXT_REQUIRED');
  });

  it('stamps fresh host research missions with their execution-policy version', () => {
    expect(plan.mission.researchExecutionVersion).toBe(1);
  });

  it.each(['observation', 'result'] as const)(
    'uses direct URL instructions for internal %s without changing owner instructions',
    (phase) => {
      const original = [
        'Owner instruction before',
        buildWebSearchContext(),
        'Owner instruction after',
      ].join('\n');
      const source = { ...binding, instructions: original };
      const compiled = researchPhaseBinding(source, phase);
      expect(compiled.instructions).toContain('Owner instruction before');
      expect(compiled.instructions).toContain('Owner instruction after');
      expect(compiled.instructions).toContain('INTERNAL RESEARCH OUTPUT');
      expect(compiled.instructions).not.toContain('CITATION FORMAT - UNICODE');
      expect(compiled.instructions).not.toContain('then provide a brief summary');
      expect(compiled.instructions).toContain(
        'Never infer or extrapolate a current value from older observations',
      );
      expect(source.instructions).toBe(original);
    },
  );

  it('preserves customized tool or owner instructions when the generated context is absent', () => {
    const instructions = 'Owner-specific source policy; do not rewrite this text.';
    expect(researchPhaseBinding({ ...binding, instructions }, 'result').instructions).toBe(
      instructions,
    );
  });

  it('forces only web_search without JSON on observation and restores final JSON', () => {
    const first = researchPhaseBinding(binding, 'observation');
    const last = researchPhaseBinding(binding, 'result');
    expect(first.clientOptions).toMatchObject({
      modelKwargs: { tool_choice: { type: 'function', function: { name: 'web_search' } } },
    });
    expect((first.clientOptions as { modelKwargs: object }).modelKwargs).not.toHaveProperty(
      'response_format',
    );
    expect(first.toolDefinitions?.map((tool) => tool.name)).toEqual(['web_search']);
    expect(last.clientOptions).toMatchObject({
      modelKwargs: { tool_choice: 'auto', response_format: { type: 'json_object' } },
    });
    expect(binding.toolDefinitions).toHaveLength(2);
    expect(binding.clientOptions).toMatchObject({
      modelKwargs: { response_format: { type: 'json_object' } },
    });
  });

  it('preserves the authorized serialized web schema without exposing unrelated tools', () => {
    const input: AgentInputs = {
      ...binding,
      toolDefinitions: undefined,
      tools: [
        {
          type: 'function',
          function: {
            name: 'web_search',
            description: 'web',
            parameters: { type: 'object', properties: {} },
          },
        },
        {
          type: 'function',
          function: {
            name: 'other',
            description: 'other',
            parameters: { type: 'object', properties: {} },
          },
        },
      ],
    };
    expect(researchPhaseBinding(input, 'observation').tools).toEqual([input.tools![0]]);
  });

  it('applies phase policy to authorized fallback without losing callback or retry admission', () => {
    const onStart = BaseCallbackHandler.fromMethods({ handleLLMStart: async () => undefined });
    const options: OpenAIClientOptions & { fallbacks: FallbackConfig[] } = {
      ...(binding.clientOptions as OpenAIClientOptions),
      fallbacks: [
        {
          provider: Providers.OPENAI,
          clientOptions: {
            callbacks: [onStart],
            modelKwargs: { response_format: { type: 'json_object' } },
          },
          retryOn: 'MODEL_RATE_LIMIT_ZERO_CHUNK',
        },
      ],
    };
    const configured: AgentInputs = {
      ...binding,
      provider: Providers.OPENAI,
      clientOptions: options,
    };
    const first = researchPhaseBinding(configured, 'observation');
    const fallback = (
      first.clientOptions as {
        fallbacks: Array<{
          clientOptions: { callbacks: unknown[]; modelKwargs: object };
          retryOn: string;
        }>;
      }
    ).fallbacks[0];
    expect(fallback.clientOptions.callbacks[0]).toBe(onStart);
    expect(fallback.retryOn).toBe('MODEL_RATE_LIMIT_ZERO_CHUNK');
    expect(fallback.clientOptions.modelKwargs).toEqual({
      tool_choice: { type: 'function', function: { name: 'web_search' } },
    });
  });

  it('requires final JSON on a fallback that was originally configured for text', () => {
    const configured = {
      ...binding,
      clientOptions: {
        fallbacks: [
          {
            provider: Providers.OPENAI,
            clientOptions: { modelKwargs: { response_format: { type: 'text' } } },
          },
        ],
      },
    } as AgentInputs;
    const result = researchPhaseBinding(configured, 'result');
    expect(result.clientOptions).toMatchObject({
      fallbacks: [
        {
          clientOptions: {
            modelKwargs: { response_format: { type: 'json_object' }, tool_choice: 'auto' },
          },
        },
      ],
    });
  });

  it.each(['none', { type: 'function', function: { name: 'unrelated_tool' } }])(
    'rejects conflicting choices %j before execution',
    (tool_choice) => {
      expect(() =>
        researchPhaseBinding(
          { ...binding, clientOptions: { modelKwargs: { tool_choice } } },
          'observation',
        ),
      ).toThrow('BOTMODE_RESEARCH_TOOL_POLICY_CONFLICT');
    },
  );
  it('rejects Responses API explicitly', () => {
    expect(() =>
      researchPhaseBinding({ ...binding, clientOptions: { useResponsesApi: true } }, 'observation'),
    ).toThrow('BOTMODE_RESEARCH_PROVIDER_UNSUPPORTED');
  });
  it('requires an executable web tool rather than registry metadata alone', () => {
    expect(() => researchPhaseBinding({ ...binding, toolDefinitions: [] }, 'observation')).toThrow(
      'BOTMODE_WEB_SEARCH_UNAVAILABLE',
    );
  });

  it('accepts completed observations from checkpoint state with no local phase counter', async () => {
    const checkpoint = state();
    await expect(requireResearchObservation(task)(checkpoint)).resolves.toBeUndefined();
    await expect(requireResearchObservation(task)(checkpoint)).resolves.toBeUndefined();
  });
  it.each(['prose', 'error', 'foreign', 'historic', 'ambiguous'] as const)(
    'rejects %s instead of starting the result phase',
    async (kind) => {
      const checkpoint = state(kind === 'error' ? 'error' : 'success');
      const ai = checkpoint.agentOutputs![researchObservationNodeId(task.nodeId)] as AIMessage;
      if (kind === 'prose') ai.tool_calls = [];
      if (kind === 'foreign') (checkpoint.messages[1] as ToolMessage).tool_call_id = 'foreign';
      if (kind === 'historic') checkpoint.messages.reverse();
      if (kind === 'ambiguous') ai.tool_calls!.push(ai.tool_calls![0]);
      await expect(requireResearchObservation(task)(checkpoint)).rejects.toThrow(
        'BOTMODE_RESEARCH_OBSERVATION_REQUIRED',
      );
    },
  );

  it('rejects unexpected event tools before host loading', () => {
    expect(() =>
      assertNativeMissionPhaseTools(plan, researchObservationNodeId(task.nodeId), [
        'unrelated_tool',
      ]),
    ).toThrow('BOTMODE_RESEARCH_TOOL_POLICY_CONFLICT');
    expect(() =>
      assertNativeMissionPhaseTools(plan, researchObservationNodeId(task.nodeId), ['web_search']),
    ).not.toThrow();
    expect(() =>
      assertNativeMissionPhaseTools(plan, task.nodeId, ['unrelated_tool']),
    ).not.toThrow();
  });

  it('fails closed when an observation identity loses its immutable plan', () => {
    expect(() =>
      assertNativeMissionPhaseTools(undefined, researchObservationNodeId(task.nodeId), [
        'web_search',
      ]),
    ).toThrow('BOTMODE_RESEARCH_PHASE_CONTEXT_REQUIRED');
    expect(() =>
      assertNativeMissionPhaseTools(plan, researchObservationNodeId('foreign'), ['web_search']),
    ).toThrow('BOTMODE_RESEARCH_PHASE_CONTEXT_REQUIRED');
    expect(() =>
      assertNativeMissionPhaseTools(undefined, 'saved-agent', ['web_search']),
    ).not.toThrow();
  });

  it('correlates only research phase identities with native permissions and source scope', () => {
    const phase = researchObservationNodeId(task.nodeId);
    expect(resolveNativeMissionToolAgentId(plan, phase)).toBe('saved');
    expect(resolveNativeMissionToolAgentId(plan, researchObservationNodeId('foreign'))).toBe(
      researchObservationNodeId('foreign'),
    );
    const context = createMissionEvidenceContext();
    context.configure({
      traceId: 'trace',
      declarations: [
        {
          nodeId: task.nodeId,
          taskId: task.taskId,
          producerAgentId: 'saved',
          toolName: 'web_search',
          criterionId: 'checked',
          expectedValue: true,
        },
      ],
      sourceTasks: [{ nodeId: task.nodeId, taskId: task.taskId, producerAgentId: 'saved' }],
    });
    expect(context.resolve(phase)).toEqual(context.resolve(task.nodeId));
  });
});

it('rebuilds the SDK graph from checkpoint without replaying completed web observation', async () => {
  const saver = new MemorySaver();
  let effects = 0,
    observationCalls = 0,
    resultCalls = 0;
  const tool = new DynamicStructuredTool({
    name: 'web_search',
    description: 'local',
    schema: z.object({ query: z.string() }),
    func: async () => {
      effects++;
      return 'source observed';
    },
  });
  const create = async () => {
    const compiled = compileNativePlan(
      plan,
      new Map([
        [
          'saved',
          {
            ...binding,
            toolDefinitions: undefined,
            tools: [tool],
            clientOptions: { apiKey: 'local-fake-key', model: 'local' },
          },
        ],
      ]),
      { checkpointer: saver },
    );
    const run = await Run.create({ runId: 'phase-recovery', graphConfig: compiled.graphConfig });
    if (!run.Graph) throw new Error('Missing SDK graph');
    run.Graph.overrideModel = {
      invoke: async (_messages, config) => {
        if (config?.metadata?.agentId === researchObservationNodeId(task.nodeId)) {
          observationCalls++;
          return new AIMessageChunk({
            id: `observation-${observationCalls}`,
            content: '',
            tool_calls: [{ id: 'recover-call', name: 'web_search', args: { query: 'local' } }],
          });
        }
        resultCalls++;
        if (resultCalls === 1) throw new Error('controlled result-phase failure');
        return new AIMessageChunk({
          id: `result-${resultCalls}`,
          content: '{"ok":true,"result":"controlled"}',
        });
      },
    };
    return run;
  };
  const config = {
    version: 'v2' as const,
    configurable: { thread_id: 'phase-thread' },
    recursionLimit: 20,
  };
  const initial = await create();
  await expect(
    initial.processStream({ messages: [new HumanMessage('Research')] }, config),
  ).rejects.toThrow();
  expect(effects).toBe(1);
  const rebuilt = await create();
  await rebuilt.processStream(new Command({}), config);
  expect(effects).toBe(1);
  expect(observationCalls).toBe(1);
  expect(resultCalls).toBe(2);
  expect(rebuilt.getAgentOutputs()[task.nodeId].content).toContain('controlled');
}, 20000);

it.each(['web_search', 'unrelated_tool'])(
  'keeps event-driven observation bounded to web_search even if model calls %s',
  async (name) => {
    let webEffects = 0,
      otherEffects = 0;
    const web = new DynamicStructuredTool({
      name: 'web_search',
      description: 'web',
      schema: z.object({ query: z.string() }),
      func: async () => {
        webEffects++;
        return 'source';
      },
    });
    const other = new DynamicStructuredTool({
      name: 'unrelated_tool',
      description: 'other',
      schema: z.object({ query: z.string() }),
      func: async () => {
        otherEffects++;
        return 'other';
      },
    });
    const loadedFor: Array<string | undefined> = [];
    const handler = createToolExecuteHandler({
      loadTools: async (names, agentId) => {
        assertNativeMissionPhaseTools(plan, agentId, names);
        loadedFor.push(agentId);
        return { loadedTools: [web, other].filter((tool) => names.includes(tool.name)) };
      },
    });
    const compiled = compileNativePlan(
      plan,
      new Map([
        ['saved', { ...binding, clientOptions: { model: 'local', apiKey: 'local-fake-key' } }],
      ]),
    );
    const run = await Run.create({
      runId: 'event-phase',
      customHandlers: { on_tool_execute: handler },
      graphConfig: compiled.graphConfig,
    });
    if (!run.Graph) throw new Error('Missing graph');
    run.Graph.overrideModel = {
      invoke: async (_messages, config) =>
        config?.metadata?.agentId === researchObservationNodeId(task.nodeId)
          ? new AIMessageChunk({
              id: 'event-ai',
              content: '',
              tool_calls: [{ id: 'event-call', name, args: { query: 'local' } }],
            })
          : new AIMessageChunk({
              id: 'event-result',
              content: '{"ok":true,"result":"controlled"}',
            }),
    };
    const operation = run.processStream(
      { messages: [new HumanMessage('Research')] },
      { version: 'v2' },
    );
    if (name === 'web_search') {
      await operation;
      expect(webEffects).toBe(1);
      expect(loadedFor).toContain(researchObservationNodeId(task.nodeId));
    } else await expect(operation).rejects.toThrow();
    expect(otherEffects).toBe(0);
  },
  20000,
);

it.each(['direct', 'event'])(
  'honors native authorization denial in %s research observation',
  async (path) => {
    let effects = 0,
      resultCalls = 0;
    const web = new DynamicStructuredTool({
      name: 'web_search',
      description: 'web',
      schema: z.object({ query: z.string() }),
      func: async () => {
        effects++;
        return 'source';
      },
    });
    const wiring = buildHITLRunWiring({ enabled: true, mode: 'bypass' })!;
    wiring.hooks.register('PreToolUse', {
      authorizationDecisionRequired: true,
      hooks: [async () => ({ decision: 'deny' as const })],
    });
    const configured = {
      ...binding,
      ...(path === 'direct' ? { toolDefinitions: undefined, tools: [web] } : {}),
      clientOptions: { apiKey: 'local-fake-key', model: 'local' },
    };
    const compiled = compileNativePlan(plan, new Map([['saved', configured]]), {
      checkpointer: new MemorySaver(),
    });
    const handler = createToolExecuteHandler({
      loadTools: async (names, agentId) => {
        assertNativeMissionPhaseTools(plan, agentId, names);
        return { loadedTools: [web] };
      },
    });
    const run = await Run.create({
      runId: 'denied-phase',
      ...wiring,
      customHandlers: { on_tool_execute: handler },
      graphConfig: compiled.graphConfig,
    });
    if (!run.Graph) throw new Error('Missing graph');
    run.Graph.overrideModel = {
      invoke: async (_messages, config) => {
        if (config?.metadata?.agentId === researchObservationNodeId(task.nodeId))
          return new AIMessageChunk({
            id: 'deny-ai',
            content: '',
            tool_calls: [{ id: 'deny-call', name: 'web_search', args: { query: 'local' } }],
          });
        resultCalls++;
        return new AIMessageChunk({
          id: 'deny-result',
          content: '{"ok":true,"result":"should not run"}',
        });
      },
    };
    await expect(
      run.processStream(
        { messages: [new HumanMessage('Research')] },
        { version: 'v2', configurable: { thread_id: `deny-${path}` } },
      ),
    ).rejects.toThrow();
    expect(effects).toBe(0);
    expect(resultCalls).toBe(0);
  },
  20000,
);
