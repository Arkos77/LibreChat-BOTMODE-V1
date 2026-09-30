import { Run, Providers } from '@librechat/agents';
import { AIMessage, HumanMessage } from '@librechat/agents/langchain/messages';
import type { AgentInputs, BaseGraphState } from '@librechat/agents';
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

describe('native plan compilation', () => {
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
      plan: typeof plan,
      bindings: typeof bindings,
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
    const native = compileNativePlan(plan, bindings);
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
