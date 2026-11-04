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
  researchObservationNodeId,
  nativeResearchComparisonQueries,
  researchPhaseBinding,
  requireResearchObservation,
} from './research';
import {
  createMissionEvidenceContext,
  resolveNativeMissionToolAgentId,
  assertNativeMissionPhaseTools,
} from './evidenceContext';
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

describe('host-owned research comparison topic extraction', () => {
  it('extracts distinct documentation queries from the real two-topic admission goal', () => {
    const queries = nativeResearchComparisonQueries(
      'MISSION DE RECEPTION PR117 : comparer les interfaces MDN SpeechRecognition (voix) et SpeechSynthesis (synthese). RECHERCHE : deux URL.',
    );
    expect(queries).toEqual(['MDN Web Docs SpeechRecognition', 'MDN Web Docs SpeechSynthesis']);
  });
  it('covers all three named speech technologies with specific and distinct searches', () => {
    const queries = nativeResearchComparisonQueries(
      'Mission BOT MODE V1 : comparer Web Speech API, Web VAD et Vosk sur Chromebook 2,7 Go RAM. RECHERCHE web avec 2 URL reelles.',
    );
    expect(queries).toEqual([
      'MDN Web Speech API SpeechRecognition documentation',
      'ricky0123 vad-web browser voice activity detection JavaScript documentation',
      'Vosk Alphacep offline speech recognition documentation',
    ]);
    expect(new Set(queries).size).toBe(3);
    expect(queries.every((query) => query.length <= 160)).toBe(true);
  });

  it('preserves two explicitly named speech subjects without generic VAD search', () => {
    expect(nativeResearchComparisonQueries('Comparer Web VAD et Vosk sur ChromeOS')).toEqual([
      'ricky0123 vad-web browser voice activity detection JavaScript documentation',
      'Vosk Alphacep offline speech recognition documentation',
    ]);
    expect(nativeResearchComparisonQueries('Compare VAD and other unknown solutions')).toEqual([]);
  });

  it('queries both full named frameworks in the exact 3 GB user mission', () => {
    const queries = nativeResearchComparisonQueries(
      'Compare FastAPI (Python) et Actix Web (Rust) pour une petite API fonctionnant sur une machine disposant de 3 Go de RAM. ' +
        'Exécute RECHERCHE → ANALYSE → SYNTHÈSE avec des sources officielles.',
    );
    expect(queries).toEqual([
      'FastAPI Python web framework official documentation fastapi.tiangolo.com',
      'Actix Web Rust web framework official documentation actix.rs',
    ]);
    expect(queries).toHaveLength(2);
    expect(new Set(queries).size).toBe(2);
  });

  it('preserves the named framework ordering and accepts hyphenated spelling', () => {
    expect(nativeResearchComparisonQueries('Comparer Actix-Web (Rust) et FastAPI (Python)')).toEqual([
      'Actix Web Rust web framework official documentation actix.rs',
      'FastAPI Python web framework official documentation fastapi.tiangolo.com',
    ]);
  });

  it('fails closed for incomplete or ambiguous framework comparisons', () => {
    expect(nativeResearchComparisonQueries('Compare FastAPI (Python) et un autre outil')).toEqual(
      [],
    );
    expect(nativeResearchComparisonQueries('Compare Actix Web (Rust) et une option inconnue')).toEqual(
      [],
    );
    expect(nativeResearchComparisonQueries('Présente FastAPI et Actix Web sans comparaison')).toEqual(
      [],
    );
    expect(nativeResearchComparisonQueries('Compare two web API frameworks')).toEqual([]);
  });

  it('supports a simple versus pair, without searching generic or ambiguous prompts', () => {
    expect(nativeResearchComparisonQueries('Compare Python vs Rust for an API')).toEqual([
      'official documentation Python',
      'official documentation Rust',
    ]);
    expect(nativeResearchComparisonQueries('Find MDN SpeechRecognition documentation')).toEqual([]);
    expect(nativeResearchComparisonQueries('Compare current options')).toEqual([]);
  });
});

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

  it('v2 passes exactly the current host-observed URLs in a native finalization prompt', async () => {
    const urls = [
      'https://example.org/compare?arch=x86_64&ram=3',
      'https://docs.example.net/rust%20versus%20python',
    ];
    const resolveSources = async () => [
      { toolCallId: 'current-call', urls },
      { toolCallId: 'stale-call', urls: ['https://untrusted.example/old'] },
    ];
    const native = compileNativePlan(
      plan,
      new Map([['saved', binding]]),
      undefined,
      undefined,
      undefined,
      resolveSources,
    );
    if (native.graphConfig.type !== 'multi-agent') throw new Error('Expected native graph');
    const edge = native.graphConfig.edges.find((item) => item.to === task.nodeId);
    expect(typeof edge?.prompt).toBe('function');
    const checkpoint = state();
    await expect(edge?.beforeTransition?.(checkpoint)).resolves.toBeUndefined();
    if (typeof edge?.prompt !== 'function') throw new Error('Missing v2 prompt');
    const prompt = await edge.prompt(checkpoint.messages, 0);
    expect(prompt).toContain('FINAL RESEARCH TASK');
    expect(prompt).toContain('A plan to continue researching');
    expect(prompt).toContain(urls[0]);
    expect(prompt).toContain(urls[1]);
    expect(prompt).not.toContain('https://untrusted.example/old');
    expect(prompt).toContain('exact observed URL');
  });

  it('keeps version 1 checkpoint topology and refuses unrelated source evidence', async () => {
    const old = structuredClone(plan);
    old.mission.researchExecutionVersion = 1;
    const legacy = compileNativePlan(old, new Map([['saved', binding]]));
    if (legacy.graphConfig.type !== 'multi-agent') throw new Error('Expected native graph');
    const legacyEdge = legacy.graphConfig.edges.find((item) => item.to === task.nodeId);
    expect(legacyEdge?.prompt).toBeUndefined();
    const versioned = compileNativePlan(
      plan,
      new Map([['saved', binding]]),
      undefined,
      undefined,
      undefined,
      async () => [{ toolCallId: 'stale-call', urls: ['https://example.org/stale'] }],
    );
    if (versioned.graphConfig.type !== 'multi-agent') throw new Error('Expected native graph');
    const edge = versioned.graphConfig.edges.find((item) => item.to === task.nodeId);
    await expect(edge?.beforeTransition?.(state())).rejects.toThrow(
      'BOTMODE_RESEARCH_SOURCES_REQUIRED',
    );
    if (typeof edge?.prompt !== 'function') throw new Error('Missing v2 prompt');
    await expect(edge.prompt(state().messages, 0)).rejects.toThrow(
      'BOTMODE_RESEARCH_SOURCES_REQUIRED',
    );
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
    expect(plan.mission.researchExecutionVersion).toBe(2);
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
    const result = researchPhaseBinding({ ...binding, instructions }, 'result');
    expect(result.instructions).toContain(instructions);
    expect(result.instructions).toContain('FINAL RESEARCH REPORT PHASE');
    expect(result.instructions).toContain('copied verbatim');
  });

  it('does not expose a model-invented date filter in native observation tool schemas', () => {
    const source: AgentInputs = {
      ...binding,
      instructions: 'Owner instructions remain unchanged.',
      toolDefinitions: [
        {
          name: 'web_search',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string' },
              date: { type: 'string', enum: ['d', 'w', 'm'] },
              country: { type: 'string' },
            },
            required: ['query', 'date'],
          },
        },
      ],
    };
    const observation = researchPhaseBinding(source, 'observation');
    expect(observation.toolDefinitions?.[0].parameters).toEqual({
      type: 'object',
      properties: {
        query: { type: 'string' },
        country: { type: 'string' },
      },
      required: ['query'],
    });
    expect(observation.instructions).toContain('search all publication dates');
    expect(observation.instructions).toContain('maximum THREE calls total');
    expect(observation.instructions).toContain('Owner instructions remain unchanged.');
    expect(source.toolDefinitions?.[0].parameters).toHaveProperty('properties.date');
    const final = researchPhaseBinding(source, 'result');
    expect(final.toolDefinitions).toBe(source.toolDefinitions);
    expect(final.toolDefinitions?.[0].parameters).toHaveProperty('properties.date');
  });

  it('preserves search schemas that never offered a date filter', () => {
    const definition = {
      name: 'web_search',
      parameters: {
        type: 'object' as const,
        properties: { query: { type: 'string' as const } },
        required: ['query'],
      },
    };
    const source: AgentInputs = {
      ...binding,
      toolDefinitions: [definition],
    };
    const observation = researchPhaseBinding(source, 'observation');
    expect(observation.toolDefinitions?.[0]).toBe(definition);
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
    expect(last.toolDefinitions).toBe(binding.toolDefinitions);
    expect(last.tools).toBe(binding.tools);
    expect(last.graphTools).toBe(binding.graphTools);
    expect(last.instructions).toContain('FINAL RESEARCH REPORT PHASE');
    expect(binding.toolDefinitions).toHaveLength(2);
    expect(binding.clientOptions).toMatchObject({
      modelKwargs: { response_format: { type: 'json_object' } },
    });
  });

  it('preserves the original authorized tools while requesting a completed report', () => {
    const tool = new DynamicStructuredTool({
      name: 'web_search',
      description: 'Search',
      schema: z.object({ query: z.string() }),
      func: async () => 'retrieved',
    });
    const configured: AgentInputs = {
      ...binding,
      tools: [tool],
      graphTools: [tool],
    };
    const final = researchPhaseBinding(configured, 'result', true);
    expect(final.clientOptions).toMatchObject({ modelKwargs: { tool_choice: 'auto' } });
    expect(final.instructions).toContain('Provide the completed report now');
    expect(final.instructions).toContain('copied verbatim');
    expect(final.tools).toBe(configured.tools);
    expect(final.graphTools).toBe(configured.graphTools);
    expect(final.toolDefinitions).toBe(configured.toolDefinitions);
    expect(final.toolEnd).toBe(false);
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

  it('accepts two distinct, fully completed web_search calls within one observation', async () => {
    const checkpoint = state();
    const ai = checkpoint.agentOutputs![researchObservationNodeId(task.nodeId)] as AIMessage;
    ai.tool_calls!.push({
      id: 'second-call',
      name: 'web_search',
      args: { query: 'MDN SpeechSynthesis documentation' },
    });
    checkpoint.messages.push(
      new ToolMessage({
        id: 'second-tool',
        tool_call_id: 'second-call',
        name: 'web_search',
        content: 'MDN SpeechSynthesis result',
        status: 'success',
      }),
    );
    const onObserved = jest.fn(async () => undefined);
    await expect(requireResearchObservation(task, onObserved)(checkpoint)).resolves.toBeUndefined();
    expect(onObserved).toHaveBeenCalledWith(['current-call', 'second-call']);
    expect(() =>
      assertNativeMissionPhaseTools(plan, researchObservationNodeId(task.nodeId), [
        'web_search',
        'web_search',
      ]),
    ).not.toThrow();
  });

  it('rejects duplicate queries and more than three checkpointed web searches', async () => {
    const duplicated = state();
    const duplicateAI = duplicated.agentOutputs![
      researchObservationNodeId(task.nodeId)
    ] as AIMessage;
    duplicateAI.tool_calls!.push({
      id: 'second-call',
      name: 'web_search',
      args: { query: 'source' },
    });
    duplicated.messages.push(
      new ToolMessage({
        id: 'second-tool',
        tool_call_id: 'second-call',
        name: 'web_search',
        content: 'duplicate',
        status: 'success',
      }),
    );
    await expect(requireResearchObservation(task)(duplicated)).rejects.toThrow(
      'BOTMODE_RESEARCH_OBSERVATION_REQUIRED',
    );

    const tooMany = state();
    const manyAI = tooMany.agentOutputs![researchObservationNodeId(task.nodeId)] as AIMessage;
    for (let i = 2; i <= 4; i++) {
      manyAI.tool_calls!.push({
        id: `call-${i}`,
        name: 'web_search',
        args: { query: `different subject ${i}` },
      });
      tooMany.messages.push(
        new ToolMessage({
          id: `tool-${i}`,
          tool_call_id: `call-${i}`,
          name: 'web_search',
          content: 'observed',
          status: 'success',
        }),
      );
    }
    await expect(requireResearchObservation(task)(tooMany)).rejects.toThrow(
      'BOTMODE_RESEARCH_OBSERVATION_REQUIRED',
    );
    expect(() =>
      assertNativeMissionPhaseTools(plan, researchObservationNodeId(task.nodeId), [
        'web_search',
        'web_search',
        'web_search',
        'web_search',
      ]),
    ).toThrow('BOTMODE_RESEARCH_TOOL_POLICY_CONFLICT');
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
