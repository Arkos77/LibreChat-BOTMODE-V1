import { Run, Providers } from '@librechat/agents';
import { AIMessage, HumanMessage } from '@librechat/agents/langchain/messages';
import { DynamicStructuredTool } from '@librechat/agents/langchain/tools';
import { z } from 'zod';
import type {
  AgentInputs,
  BaseGraphState,
  FallbackConfig,
  OpenAIClientOptions,
} from '@librechat/agents';
import { deterministicPlanner } from './planner';
import { compileNativePlan } from './native';

const context = {
  worker: {
    id: 'worker',
    agentId: 'worker',
    role: 'general',
    capabilities: ['basic'],
    constraints: [],
  },
  specialists: [
    { id: 'x', agentId: 'x', role: 'X', capabilities: ['x'], constraints: [] },
    { id: 'y', agentId: 'y', role: 'Y', capabilities: ['y'], constraints: [] },
  ],
};
const bindings = new Map<string, AgentInputs>(
  ['worker', 'x', 'y'].map((agentId) => [
    agentId,
    {
      agentId,
      provider: Providers.OPENAI,
      instructions: 'Authorized instructions',
    },
  ]),
);
const base = {
  missionId: 'mission-native',
  taskId: 'root',
  objective: 'Test native execution',
  requiredCapabilities: ['basic'],
  constraints: ['offline'],
};

type FallbackOptions = OpenAIClientOptions & { fallbacks: FallbackConfig[] };

describe('validated native output contract', () => {
  const validatedPlan = () =>
    deterministicPlanner.planMission(
      {
        ...base,
        validation: { criteria: [{ id: 'complete', field: 'complete', expected: true }] },
      },
      context,
    );

  it.each(['tools', 'toolDefinitions', 'graphTools'] as const)(
    'enables an explicit automatic choice for authorized %s without changing the binding',
    (field) => {
      const input = new Map(bindings);
      const options = { modelKwargs: { response_format: { type: 'json_object' } } };
      const tool = new DynamicStructuredTool({
        name: 'web_search',
        description: 'Authorized search',
        schema: z.object({ query: z.string() }),
        func: async () => '',
      });
      let toolFields: Pick<AgentInputs, 'tools' | 'toolDefinitions' | 'graphTools'>;
      if (field === 'toolDefinitions') {
        toolFields = { toolDefinitions: [{ name: 'web_search' }] };
      } else if (field === 'graphTools') {
        toolFields = { graphTools: [tool] };
      } else {
        toolFields = { tools: [tool] };
      }
      input.set('worker', {
        ...bindings.get('worker')!,
        clientOptions: options,
        ...toolFields,
      });
      const agent = compileNativePlan(validatedPlan(), input).graphConfig.agents[0];
      expect(agent.clientOptions).toMatchObject({ modelKwargs: { tool_choice: 'auto' } });
      expect(input.get('worker')!.clientOptions).toBe(options);
      expect(options.modelKwargs).not.toHaveProperty('tool_choice');
    },
  );

  it.each(['tools', 'toolDefinitions', 'graphTools'] as const)(
    'keeps implicit tool choice across nested fallback bindings with %s',
    (field) => {
      const tool = new DynamicStructuredTool({
        name: 'check_background_task',
        description: 'Authorized host control',
        schema: z.object({}),
        func: async () => '',
      });
      const options = {
        model: 'primary',
        fallbacks: [
          {
            provider: Providers.OPENROUTER,
            clientOptions: {
              model: 'secondary',
              fallbacks: [
                {
                  provider: Providers.OPENAI,
                  clientOptions: { model: 'third' },
                  retryOn: 'MODEL_RATE_LIMIT_ZERO_CHUNK' as const,
                },
              ],
            },
            retryOn: 'MODEL_RATE_LIMIT_ZERO_CHUNK' as const,
          },
        ],
      };
      const before = JSON.stringify(options);
      const input = new Map(bindings);
      input.set('worker', {
        ...bindings.get('worker')!,
        provider: Providers.OPENROUTER,
        [field]: field === 'toolDefinitions' ? [{ name: tool.name }] : [tool],
        clientOptions: options,
      });
      const agent = compileNativePlan(validatedPlan(), input).graphConfig.agents[0];
      const primary = agent.clientOptions as typeof options & { modelKwargs: unknown };
      expect(primary).toMatchObject({
        model: 'primary',
        modelKwargs: { tool_choice: 'auto' },
        fallbacks: [
          {
            provider: Providers.OPENROUTER,
            retryOn: 'MODEL_RATE_LIMIT_ZERO_CHUNK',
            clientOptions: {
              model: 'secondary',
              modelKwargs: { tool_choice: 'auto' },
              fallbacks: [
                {
                  provider: Providers.OPENAI,
                  clientOptions: {
                    model: 'third',
                    modelKwargs: { tool_choice: 'auto' },
                  },
                },
              ],
            },
          },
        ],
      });
      expect(JSON.stringify(options)).toBe(before);
    },
  );

  it.each(['none', 'required', { type: 'function', function: { name: 'authorized_tool' } }])(
    'preserves an explicitly configured tool choice',
    (choice) => {
      const input = new Map(bindings);
      input.set('worker', {
        ...bindings.get('worker')!,
        toolDefinitions: [{ name: 'authorized_tool' }],
        clientOptions: { modelKwargs: { tool_choice: choice } },
      });
      const agent = compileNativePlan(validatedPlan(), input).graphConfig.agents[0];
      expect(agent.clientOptions).toMatchObject({ modelKwargs: { tool_choice: choice } });
    },
  );

  it.each(['none', 'required', { type: 'function', function: { name: 'authorized_tool' } }])(
    'preserves a fallback-specific explicit choice independently from primary',
    (choice) => {
      const input = new Map(bindings);
      input.set('worker', {
        ...bindings.get('worker')!,
        toolDefinitions: [{ name: 'authorized_tool' }],
        clientOptions: {
          fallbacks: [
            {
              provider: Providers.OPENROUTER,
              clientOptions: { modelKwargs: { tool_choice: choice } },
              retryOn: 'MODEL_RATE_LIMIT_ZERO_CHUNK',
            },
          ],
        } as FallbackOptions,
      });
      expect(
        compileNativePlan(validatedPlan(), input).graphConfig.agents[0].clientOptions,
      ).toMatchObject({
        modelKwargs: { tool_choice: 'auto' },
        fallbacks: [
          {
            clientOptions: { modelKwargs: { tool_choice: choice } },
          },
        ],
      });
    },
  );

  it.each([
    { provider: Providers.OPENAI, clientOptions: { useResponsesApi: true } },
    { provider: Providers.ANTHROPIC, clientOptions: { model: 'other-provider' } },
  ])(
    'does not inject Chat Completions options into unsupported fallback transport: %j',
    (fallback) => {
      const input = new Map(bindings);
      input.set('worker', {
        ...bindings.get('worker')!,
        toolDefinitions: [{ name: 'authorized_tool' }],
        clientOptions: {
          fallbacks: [{ ...fallback, retryOn: 'MODEL_RATE_LIMIT_ZERO_CHUNK' }],
        } as FallbackOptions,
      });
      const result = compileNativePlan(validatedPlan(), input).graphConfig.agents[0].clientOptions;
      expect(result).toMatchObject({ fallbacks: [{ clientOptions: fallback.clientOptions }] });
      expect(
        (result as { fallbacks: Array<{ clientOptions: unknown }> }).fallbacks[0].clientOptions,
      ).not.toHaveProperty('modelKwargs');
    },
  );

  it.each([
    { toolDefinitions: [] },
    { toolDefinitions: [{ name: 'deferred', defer_loading: true }] },
  ])(
    'does not enable tools on primary or fallback without an authorized eager tool',
    ({ toolDefinitions }) => {
      const input = new Map(bindings);
      input.set('worker', {
        ...bindings.get('worker')!,
        toolDefinitions,
        clientOptions: {
          fallbacks: [
            {
              provider: Providers.OPENROUTER,
              clientOptions: { model: 'secondary' },
              retryOn: 'MODEL_RATE_LIMIT_ZERO_CHUNK',
            },
          ],
        } as FallbackOptions,
      });
      const result = compileNativePlan(validatedPlan(), input).graphConfig.agents[0].clientOptions;
      expect(result).not.toHaveProperty('modelKwargs.tool_choice');
      expect(
        (result as { fallbacks: Array<{ clientOptions: unknown }> }).fallbacks[0].clientOptions,
      ).not.toHaveProperty('modelKwargs.tool_choice');
    },
  );

  it('does not enable a tool from capability or registry metadata alone', () => {
    const input = new Map(bindings);
    input.set('worker', {
      ...bindings.get('worker')!,
      tools: [],
      toolDefinitions: [{ name: 'deferred', defer_loading: true }],
      toolRegistry: new Map([['web_search', { name: 'web_search' }]]),
    });
    expect(
      compileNativePlan(validatedPlan(), input).graphConfig.agents[0].clientOptions,
    ).not.toHaveProperty('modelKwargs.tool_choice');
  });

  it.each([Providers.OPENAI, 'openrouter'])(
    'gives the producer the validation contract and JSON transport for %s',
    (provider) => {
      const input = new Map(bindings);
      input.set('worker', {
        ...bindings.get('worker')!,
        provider: provider as AgentInputs['provider'],
        clientOptions: { model: 'offline-model', temperature: 0.2 },
      });
      const agent = compileNativePlan(validatedPlan(), input).graphConfig.agents[0];
      const machineContext = JSON.parse(
        String(agent.instructions)
          .split('\n')
          .find((line) => line.startsWith('{'))!,
      );
      expect(machineContext.validation).toEqual([
        { criteria: [{ id: 'complete', field: 'complete', expected: true }] },
      ]);
      expect(agent.clientOptions).toMatchObject({
        model: 'offline-model',
        temperature: 0.2,
        modelKwargs: { response_format: { type: 'json_object' } },
      });
      expect(input.get('worker')!.clientOptions).toEqual({
        model: 'offline-model',
        temperature: 0.2,
      });
    },
  );

  it('does not inject Chat Completions kwargs into the Responses API', () => {
    const input = new Map(bindings);
    input.set('worker', {
      ...bindings.get('worker')!,
      clientOptions: { model: 'offline-response-model', useResponsesApi: true },
    });
    const agent = compileNativePlan(validatedPlan(), input).graphConfig.agents[0];
    expect(agent.clientOptions).toEqual({ model: 'offline-response-model', useResponsesApi: true });
  });

  it('keeps an explicit structured JSON schema and unrelated provider options', () => {
    const schema = {
      type: 'json_schema',
      json_schema: { name: 'task', schema: { type: 'object' } },
    };
    const input = new Map(bindings);
    input.set('worker', {
      ...bindings.get('worker')!,
      clientOptions: {
        modelKwargs: { response_format: schema, provider: { require_parameters: true } },
      },
    });
    const agent = compileNativePlan(validatedPlan(), input).graphConfig.agents[0];
    expect(agent.clientOptions).toEqual(input.get('worker')!.clientOptions);
  });

  it('replaces explicit text output for a task that Oracle requires to be JSON', () => {
    const input = new Map(bindings);
    input.set('worker', {
      ...bindings.get('worker')!,
      clientOptions: { modelKwargs: { response_format: { type: 'text' } } },
    });
    expect(
      compileNativePlan(validatedPlan(), input).graphConfig.agents[0].clientOptions,
    ).toMatchObject({
      modelKwargs: { response_format: { type: 'json_object' } },
    });
  });

  it('does not inject OpenAI transport fields into another provider', () => {
    const input = new Map(bindings);
    input.set('worker', {
      agentId: 'worker',
      provider: Providers.ANTHROPIC,
      clientOptions: { model: 'offline-model' },
    });
    const agent = compileNativePlan(validatedPlan(), input).graphConfig.agents[0];
    expect(agent.clientOptions).toEqual({ model: 'offline-model' });
    const machineContext = JSON.parse(
      String(agent.instructions)
        .split('\n')
        .find((line) => line.startsWith('{'))!,
    );
    expect(machineContext.validation).toEqual([
      { criteria: [{ id: 'complete', field: 'complete', expected: true }] },
    ]);
  });

  it('leaves a legacy task without validation transport unchanged', () => {
    const agent = compileNativePlan(deterministicPlanner.planMission(base, context), bindings)
      .graphConfig.agents[0];
    expect(agent.clientOptions).toBeUndefined();
  });
});

describe('native plan compilation', () => {
  it('blocks plain-text delegation arguments instead of treating them as completed work', async () => {
    const plan = deterministicPlanner.planMission(
      {
        ...base,
        validation: { criteria: [{ id: 'completed', field: 'ok', expected: true }] },
        objectives: [
          {
            key: 'research',
            objective: 'Research',
            requiredCapabilities: ['basic'],
            dependsOn: [],
          },
          {
            key: 'synthesis',
            objective: 'Synthesize',
            requiredCapabilities: ['basic'],
            dependsOn: ['research'],
          },
        ],
      },
      context,
    );
    const outcomes: Array<{ taskId: string; statuses: string[] }> = [];
    const native = compileNativePlan(plan, bindings, undefined, undefined, async (result) => {
      outcomes.push({ taskId: result.taskId, statuses: result.verdicts.map((v) => v.status) });
    });
    const run = await Run.create({
      runId: 'delegation-text-only',
      graphConfig: native.graphConfig,
    });
    if (!run.Graph) throw new Error('Graph missing');
    run.Graph.overrideTestModel([
      JSON.stringify({
        intent: 'Delegate research',
        description: 'Produce a sourced result',
        subagent_type: 'research-agent',
        run_in_background: false,
      }),
    ]);
    await expect(
      run.processStream(
        { messages: [new HumanMessage('Research and synthesize.')] },
        { version: 'v2' },
      ),
    ).rejects.toThrow('REJECTED');
    expect(outcomes).toEqual([{ taskId: plan.tasks[0].taskId, statuses: ['REJECTED'] }]);
  });

  it('executes the zero-specialist configuration on the real StandardGraph', async () => {
    const plan = deterministicPlanner.planMission(base, context);
    const native = compileNativePlan(plan, bindings);
    expect(native.graphConfig.type).toBe('standard');
    expect(native.graphConfig.agents).toHaveLength(1);
    expect(native.graphConfig.agents[0].subagentConfigs).toBeUndefined();
    const run = await Run.create({ runId: 'direct', graphConfig: native.graphConfig });
    if (!run.Graph) {
      throw new Error('Graph missing');
    }
    run.Graph.overrideTestModel(['{"answer":42}']);
    await run.processStream({ messages: [new HumanMessage('Execute.')] }, { version: 'v2' });
    expect(run.getHaltReason()).toBeUndefined();
    expect(run.getRunMessages()?.some((m) => m.content === '{"answer":42}')).toBe(true);
  });
  it('compiles and executes a native diamond with a grouped fan-in barrier', async () => {
    const plan = deterministicPlanner.planMission(
      {
        ...base,
        objectives: [
          { key: 'a', objective: 'Prepare', requiredCapabilities: ['basic'], dependsOn: [] },
          { key: 'b', objective: 'Branch X', requiredCapabilities: ['x'], dependsOn: ['a'] },
          { key: 'c', objective: 'Branch Y', requiredCapabilities: ['y'], dependsOn: ['a'] },
          {
            key: 'd',
            objective: 'Synthesize',
            requiredCapabilities: ['basic'],
            dependsOn: ['b', 'c'],
            validation: { criteria: [{ id: 'ok', field: 'ok', expected: true }] },
          },
        ],
      },
      context,
    );
    const native = compileNativePlan(plan, bindings);
    expect(native.graphConfig.type).toBe('multi-agent');
    if (native.graphConfig.type !== 'multi-agent') {
      throw new Error('MultiAgentGraph required');
    }
    expect(native.graphConfig.edges).toContainEqual(
      expect.objectContaining({
        from: [plan.tasks[1].nodeId, plan.tasks[2].nodeId],
        to: plan.tasks[3].nodeId,
        edgeType: 'direct',
        beforeTransition: expect.any(Function),
      }),
    );
    expect(native.validation[0]).toMatchObject({
      taskId: plan.tasks[3].taskId,
      nodeId: plan.tasks[3].nodeId,
      requirements: plan.tasks[3].validation,
    });
    const run = await Run.create({ runId: 'diamond', graphConfig: native.graphConfig });
    if (!run.Graph) {
      throw new Error('Graph missing');
    }
    run.Graph.overrideTestModel(['{"ok":true}']);
    run.graphRunnable = run.Graph.createWorkflow();
    const lifecycle: string[] = [];
    const nodes = new Set(plan.tasks.map((task) => task.nodeId));
    for await (const event of run.graphRunnable.streamEvents(
      { messages: [new HumanMessage('Execute the diamond.')] },
      { version: 'v2' },
    )) {
      if (nodes.has(event.name) && ['on_chain_start', 'on_chain_end'].includes(event.event)) {
        lifecycle.push(`${event.event}:${event.name}`);
      }
    }
    for (const task of plan.tasks) {
      expect(lifecycle.filter((entry) => entry === `on_chain_start:${task.nodeId}`)).toHaveLength(
        1,
      );
      expect(lifecycle).toContain(`on_chain_end:${task.nodeId}`);
    }
    for (const task of plan.tasks) {
      for (const dependency of task.dependsOn) {
        const predecessor = plan.tasks.find((item) => item.key === dependency)!;
        expect(lifecycle.indexOf(`on_chain_end:${predecessor.nodeId}`)).toBeLessThan(
          lifecycle.indexOf(`on_chain_start:${task.nodeId}`),
        );
      }
    }
    const branchStarts = plan.tasks
      .slice(1, 3)
      .map((task) => lifecycle.indexOf(`on_chain_start:${task.nodeId}`));
    const branchEnds = plan.tasks
      .slice(1, 3)
      .map((task) => lifecycle.indexOf(`on_chain_end:${task.nodeId}`));
    expect(Math.max(...branchStarts)).toBeLessThan(Math.min(...branchEnds));
    expect(run.getHaltReason()).toBeUndefined();
    expect(bindings.get('worker')?.instructions).toBe('Authorized instructions');
  });
  it('fails closed until every direct predecessor output is checkpointed', async () => {
    const plan = deterministicPlanner.planMission(
      {
        ...base,
        objectives: [
          { key: 'a', objective: 'Branch X', requiredCapabilities: ['x'], dependsOn: [] },
          { key: 'b', objective: 'Branch Y', requiredCapabilities: ['y'], dependsOn: [] },
          {
            key: 'c',
            objective: 'Synthesize',
            requiredCapabilities: ['basic'],
            dependsOn: ['a', 'b'],
          },
        ],
      },
      context,
    );
    const native = compileNativePlan(plan, bindings);
    expect(native.graphConfig.type).toBe('multi-agent');
    if (native.graphConfig.type !== 'multi-agent') {
      throw new Error('MultiAgentGraph required');
    }
    const edge = native.graphConfig.edges[0];
    expect(edge.beforeTransition).toEqual(expect.any(Function));
    const outputA = new AIMessage('A');
    const outputB = new AIMessage('B');
    const state = (
      agentOutputs: BaseGraphState['agentOutputs'],
      messages: BaseGraphState['messages'] = [],
    ): BaseGraphState => ({ messages, agentOutputs }) as BaseGraphState;

    await expect(edge.beforeTransition?.(state({}))).rejects.toThrow(plan.tasks[0].nodeId);
    await expect(
      edge.beforeTransition?.(state({ [plan.tasks[0].nodeId]: outputA }, [outputA])),
    ).rejects.toThrow(plan.tasks[1].nodeId);
    await expect(
      edge.beforeTransition?.(
        state(
          {
            [plan.tasks[0].nodeId]: outputA,
            [plan.tasks[1].nodeId]: outputB,
          },
          [outputA, outputB],
        ),
      ),
    ).resolves.toBeUndefined();
  });

  it('runs Oracle on validated predecessors before allowing a dependent transition', async () => {
    const plan = deterministicPlanner.planMission(
      {
        ...base,
        objectives: [
          {
            key: 'checked',
            objective: 'Produce checked result',
            requiredCapabilities: ['x'],
            dependsOn: [],
            validation: { criteria: [{ id: 'ok', field: 'ok', expected: true }] },
          },
          {
            key: 'consume',
            objective: 'Consume checked result',
            requiredCapabilities: ['basic'],
            dependsOn: ['checked'],
          },
        ],
      },
      context,
    );
    const native = compileNativePlan(plan, bindings);
    expect(native.graphConfig.type).toBe('multi-agent');
    if (native.graphConfig.type !== 'multi-agent') throw new Error('MultiAgentGraph required');
    const edge = native.graphConfig.edges[0];
    const checked = plan.tasks[0];
    const state = (output: AIMessage): BaseGraphState =>
      ({ messages: [output], agentOutputs: { [checked.nodeId]: output } }) as BaseGraphState;

    await expect(
      edge.beforeTransition?.(state(new AIMessage('{"ok":true}'))),
    ).resolves.toBeUndefined();
    await expect(edge.beforeTransition?.(state(new AIMessage('{"ok":false}')))).rejects.toThrow(
      'REJECTED',
    );
    await expect(edge.beforeTransition?.(state(new AIMessage('not-json')))).rejects.toThrow(
      'REJECTED',
    );
  });

  it('uses host-resolved durable evidence when gating a validated predecessor transition', async () => {
    const plan = deterministicPlanner.planMission(
      {
        ...base,
        objectives: [
          {
            key: 'checked',
            objective: 'Produce independently checked result',
            requiredCapabilities: ['x'],
            dependsOn: [],
            validation: {
              criteria: [{ id: 'ok', field: 'ok', expected: true }],
              requireIndependentEvidence: true,
            },
          },
          {
            key: 'consume',
            objective: 'Consume independently checked result',
            requiredCapabilities: ['basic'],
            dependsOn: ['checked'],
          },
        ],
      },
      context,
    );
    const checked = plan.tasks[0];
    const resolveMissionOracleEvidence = jest.fn(async (taskId: string) => {
      expect(taskId).toBe(checked.taskId);
      return [
        {
          id: 'tool-transition-1',
          criterionId: 'ok',
          value: true,
          source: { id: 'tool-transition-1', type: 'tool' as const, agentId: 'checker' },
        },
      ];
    });
    const native = compileNativePlan(plan, bindings, undefined, resolveMissionOracleEvidence);
    expect(native.graphConfig.type).toBe('multi-agent');
    if (native.graphConfig.type !== 'multi-agent') throw new Error('MultiAgentGraph required');
    const edge = native.graphConfig.edges[0];
    const output = new AIMessage('{"ok":true}');
    const state = {
      messages: [output],
      agentOutputs: { [checked.nodeId]: output },
    } as BaseGraphState;

    await expect(edge.beforeTransition?.(state)).resolves.toBeUndefined();
    expect(resolveMissionOracleEvidence).toHaveBeenCalledTimes(1);
    expect(resolveMissionOracleEvidence).toHaveBeenCalledWith(checked.taskId);
  });

  it('persists the exact Oracle result before allowing a validated predecessor transition', async () => {
    const plan = deterministicPlanner.planMission(
      {
        ...base,
        objectives: [
          {
            key: 'checked',
            objective: 'Produce checked result',
            requiredCapabilities: ['x'],
            dependsOn: [],
            validation: { criteria: [{ id: 'ok', field: 'ok', expected: true }] },
          },
          {
            key: 'consume',
            objective: 'Consume checked result',
            requiredCapabilities: ['basic'],
            dependsOn: ['checked'],
          },
        ],
      },
      context,
    );
    const checked = plan.tasks[0];
    const persistMissionOracleResult = jest.fn(async () => {});
    const compile = compileNativePlan as unknown as (
      plan: Parameters<typeof compileNativePlan>[0],
      bindings: Parameters<typeof compileNativePlan>[1],
      compileOptions?: undefined,
      resolveMissionOracleEvidence?: undefined,
      persistMissionOracleResult?: (result: unknown) => Promise<void>,
    ) => ReturnType<typeof compileNativePlan>;
    const native = compile(plan, bindings, undefined, undefined, persistMissionOracleResult);
    expect(native.graphConfig.type).toBe('multi-agent');
    if (native.graphConfig.type !== 'multi-agent') throw new Error('MultiAgentGraph required');
    const edge = native.graphConfig.edges[0];
    const output = new AIMessage('{"ok":true}');

    await expect(
      edge.beforeTransition?.({
        messages: [output],
        agentOutputs: { [checked.nodeId]: output },
      } as BaseGraphState),
    ).resolves.toBeUndefined();

    expect(persistMissionOracleResult).toHaveBeenCalledTimes(1);
    expect(persistMissionOracleResult).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: checked.taskId,
        nodeId: checked.nodeId,
        verdicts: [expect.objectContaining({ status: 'VERIFIED' })],
      }),
    );
  });

  it('fails closed when predecessor validation requires independent evidence that is unavailable', async () => {
    const plan = deterministicPlanner.planMission(
      {
        ...base,
        objectives: [
          {
            key: 'checked',
            objective: 'Produce independently checked result',
            requiredCapabilities: ['x'],
            dependsOn: [],
            validation: {
              criteria: [{ id: 'ok', field: 'ok', expected: true }],
              requireIndependentEvidence: true,
            },
          },
          {
            key: 'consume',
            objective: 'Consume independently checked result',
            requiredCapabilities: ['basic'],
            dependsOn: ['checked'],
          },
        ],
      },
      context,
    );
    const persistMissionOracleResult = jest.fn(async () => {});
    const native = compileNativePlan(
      plan,
      bindings,
      undefined,
      undefined,
      persistMissionOracleResult,
    );
    expect(native.graphConfig.type).toBe('multi-agent');
    if (native.graphConfig.type !== 'multi-agent') throw new Error('MultiAgentGraph required');
    const edge = native.graphConfig.edges[0];
    const checked = plan.tasks[0];
    const output = new AIMessage('{"ok":true}');
    const state = {
      messages: [output],
      agentOutputs: { [checked.nodeId]: output },
    } as BaseGraphState;

    await expect(edge.beforeTransition?.(state)).rejects.toThrow('UNKNOWN');
    expect(persistMissionOracleResult).toHaveBeenCalledTimes(1);
    expect(persistMissionOracleResult).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: checked.taskId,
        nodeId: checked.nodeId,
        verdicts: [expect.objectContaining({ status: 'UNKNOWN' })],
      }),
    );
  });

  it('fails closed when a validated predecessor output is non-text content', async () => {
    const plan = deterministicPlanner.planMission(
      {
        ...base,
        objectives: [
          {
            key: 'checked',
            objective: 'Produce checked result',
            requiredCapabilities: ['x'],
            dependsOn: [],
            validation: { criteria: [{ id: 'ok', field: 'ok', expected: true }] },
          },
          {
            key: 'consume',
            objective: 'Consume checked result',
            requiredCapabilities: ['basic'],
            dependsOn: ['checked'],
          },
        ],
      },
      context,
    );
    const native = compileNativePlan(plan, bindings);
    expect(native.graphConfig.type).toBe('multi-agent');
    if (native.graphConfig.type !== 'multi-agent') throw new Error('MultiAgentGraph required');
    const edge = native.graphConfig.edges[0];
    const checked = plan.tasks[0];
    const output = new AIMessage([{ type: 'text', text: '{"ok":true}' }]);
    const state = {
      messages: [output],
      agentOutputs: { [checked.nodeId]: output },
    } as BaseGraphState;

    await expect(edge.beforeTransition?.(state)).rejects.toThrow('UNKNOWN');
  });

  it('rejects missing authorized bindings', () => {
    const plan = deterministicPlanner.planMission(base, context);
    expect(() => compileNativePlan(plan, new Map())).toThrow('binding');
  });
  it('keeps host compile options and exposes the native actor to saved-agent mapping', () => {
    const plan = deterministicPlanner.planMission(base, context);
    const compileOptions = {};
    const native = compileNativePlan(plan, bindings, compileOptions);
    expect(native.graphConfig.compileOptions).toBe(compileOptions);
    expect(native.actors).toEqual([
      { nodeId: plan.tasks[0].nodeId, agentId: 'worker', taskId: plan.tasks[0].taskId },
    ]);
    expect(native.graphConfig.agents[0].instructions).toContain('offline');
  });
  it('rejects a mismatched binding or altered node identity', () => {
    const plan = deterministicPlanner.planMission(base, context);
    expect(() => compileNativePlan(plan, new Map([['worker', bindings.get('x')!]]))).toThrow(
      'binding',
    );
    plan.tasks[0].nodeId = 'unrelated-node';
    expect(() => compileNativePlan(plan, bindings)).toThrow('identity');
  });
});

it('passes same-task observed sources into dependency-transition Oracle validation', async () => {
  const plan = deterministicPlanner.planMission(
    {
      ...base,
      researchExecutionVersion: 1,
      objectives: [
        {
          key: 'research',
          objective: 'Research',
          requiredCapabilities: ['x'],
          dependsOn: [],
          validation: {
            criteria: [{ id: 'ok', field: 'ok', expected: true }],
            outputContract: 'research-v1',
          },
        },
        {
          key: 'use',
          objective: 'Use research',
          requiredCapabilities: ['basic'],
          dependsOn: ['research'],
        },
      ],
    },
    context,
  );
  const checked = plan.tasks[0];
  const native = compileNativePlan(
    plan,
    new Map([
      ...bindings,
      ['x', { ...bindings.get('x')!, toolDefinitions: [{ name: 'web_search' }] }],
    ]),
    undefined,
    undefined,
    undefined,
    async (taskId) =>
      taskId === checked.taskId
        ? [{ toolCallId: 'search', urls: ['https://example.org/report'] }]
        : [],
  );
  if (native.graphConfig.type !== 'multi-agent') throw new Error('Expected multi-agent');
  const output = new AIMessage(
    JSON.stringify({
      ok: true,
      result: 'See https://example.org/report',
      sources: 'https://example.org/report',
    }),
  );
  await expect(
    native.graphConfig.edges[0].beforeTransition?.({
      messages: [output],
      agentOutputs: { [checked.nodeId]: output },
    } as BaseGraphState),
  ).resolves.toBeUndefined();
});
