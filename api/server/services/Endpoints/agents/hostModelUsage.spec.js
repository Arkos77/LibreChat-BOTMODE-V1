const { projectHostModelUsage } = require('./hostModelUsage');

describe('P11 model invocation evidence', () => {
  const decision = {
    traceId: 'trace-1',
    decisionId: 'decision-1',
    selectedModel: 'b:free',
    agentId: 'agent-primary',
  };
  function researchActors() {
    const {
      prepareBotModeMission,
      deterministicPlanner,
      compileNativePlan,
    } = require('@librechat/api');
    const plan = deterministicPlanner.planMission(
      prepareBotModeMission({
        missionId: 'usage-phase',
        taskId: 'usage-root',
        objective: 'Research',
        requiredCapabilities: ['web_search'],
        constraints: [],
      }),
      {
        worker: {
          id: 'worker',
          agentId: decision.agentId,
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
          decision.agentId,
          {
            agentId: decision.agentId,
            provider: 'openai',
            toolDefinitions: [{ name: 'web_search' }],
          },
        ],
      ]),
    );
    return {
      plan,
      observation: native.actors.find((actor) => actor.nodeId !== plan.tasks[0].nodeId).nodeId,
    };
  }

  it('includes both native research phases in the saved agent usage receipt', () => {
    const { plan, observation } = researchActors();
    const receipt = projectHostModelUsage(
      decision,
      [
        {
          agentId: observation,
          provider: 'openrouter',
          model: 'b:free',
          input_tokens: 2,
          output_tokens: 1,
          cost: 0.001,
        },
        {
          agentId: plan.tasks[0].nodeId,
          provider: 'openrouter',
          model: 'b:free',
          input_tokens: 3,
          output_tokens: 2,
          cost: 0.002,
        },
      ],
      plan,
    );
    expect(receipt.modelCalls.map((call) => call.actorId)).toEqual([
      observation,
      plan.tasks[0].nodeId,
    ]);
    expect(receipt.total).toMatchObject({ inputTokens: 5, outputTokens: 3, costUsd: 0.003 });
  });

  it('retains an observation-only fallback even when final output uses the primary', () => {
    const { plan, observation } = researchActors();
    const receipt = projectHostModelUsage(
      {
        ...decision,
        selectedProvider: 'openrouter',
        authorizedBindings: [
          { provider: 'openrouter', model: 'b:free' },
          { provider: 'openrouter', model: 'a:free' },
        ],
      },
      [
        {
          agentId: observation,
          provider: 'openrouter',
          model: 'a:free',
          input_tokens: 2,
          output_tokens: 1,
        },
        {
          agentId: plan.tasks[0].nodeId,
          provider: 'openrouter',
          model: 'b:free',
          input_tokens: 3,
          output_tokens: 2,
        },
      ],
      plan,
    );
    expect(receipt.fallbackUsed).toBe(true);
    expect(receipt.modelCalls).toHaveLength(2);
    expect(receipt.total.costKnown).toBe(false);
  });

  it('keeps an observation-only receipt when no final model call completes', () => {
    const { plan, observation } = researchActors();
    const receipt = projectHostModelUsage(
      decision,
      [
        {
          agentId: observation,
          provider: 'openrouter',
          model: 'b:free',
          input_tokens: 2,
          output_tokens: 1,
        },
      ],
      plan,
    );
    expect(receipt.modelCalls).toEqual([
      expect.objectContaining({ actorId: observation, inputTokens: 2 }),
    ]);
  });

  it.each(['foreign', 'forged', 'ambiguous', 'old-version', 'not-research'])(
    'does not attribute a %s observation actor',
    (mode) => {
      const { plan, observation } = researchActors();
      if (mode === 'foreign') plan.tasks[0].agentId = 'other';
      if (mode === 'forged') plan.tasks[0].nodeId = 'forged';
      if (mode === 'ambiguous') plan.tasks.push({ ...plan.tasks[0], agentId: 'other' });
      if (mode === 'old-version') delete plan.mission.researchExecutionVersion;
      if (mode === 'not-research') plan.tasks[0].validation = [];
      expect(
        projectHostModelUsage(
          decision,
          [
            {
              agentId: observation,
              provider: 'openrouter',
              model: 'b:free',
              input_tokens: 2,
              output_tokens: 1,
            },
          ],
          plan,
        ),
      ).toBeUndefined();
    },
  );

  it.each(['own', 'foreign', 'forged', 'ambiguous', 'missing-mission'])(
    'attributes only canonical actors of the selected agent: %s',
    (mode) => {
      const { nodeIdentity } = require('@librechat/api');
      const nodeId = nodeIdentity('fixture-mission', 'task');
      const plan = {
        mission: { missionId: mode === 'missing-mission' ? undefined : 'fixture-mission' },
        tasks: [
          {
            key: 'task',
            nodeId: mode === 'forged' ? 'forged-node' : nodeId,
            agentId: mode === 'foreign' ? 'foreign-agent' : 'agent-primary',
          },
        ],
      };
      if (mode === 'ambiguous') plan.tasks.push({ ...plan.tasks[0], agentId: 'foreign-agent' });
      const receipt = projectHostModelUsage(
        decision,
        [
          {
            agentId: nodeId,
            provider: 'openrouter',
            model: 'b:free',
            input_tokens: 2,
            output_tokens: 1,
          },
        ],
        plan,
      );
      if (mode === 'own')
        expect(receipt.modelCalls).toMatchObject([
          { actorId: nodeId, inputTokens: 2, outputTokens: 1 },
        ]);
      else expect(receipt).toBeUndefined();
    },
  );
  it.each(['ambiguous-runtime', 'unapproved-model', 'unapproved-runtime'])(
    'does not admit ambiguous or unauthorized compatibility usage: %s',
    (mode) => {
      const bindings = [{ provider: 'CompatA', runtimeProvider: 'openAI', model: 'm:free' }];
      if (mode === 'ambiguous-runtime')
        bindings.push({ provider: 'CompatB', runtimeProvider: 'openAI', model: 'm:free' });
      expect(
        projectHostModelUsage(
          {
            ...decision,
            selectedProvider: 'CompatA',
            selectedModel: 'm:free',
            authorizedBindings: bindings,
          },
          [
            {
              agentId: 'agent-primary',
              provider: mode === 'unapproved-runtime' ? 'other' : 'openAI',
              model: mode === 'unapproved-model' ? 'other:free' : 'm:free',
              input_tokens: 1,
              output_tokens: 1,
            },
          ],
        ),
      ).toBeUndefined();
    },
  );
  it('links the durable decision to bounded primary provider usage', () => {
    const result = projectHostModelUsage(decision, [
      {
        agentId: 'agent-primary',
        model: 'b:free',
        provider: 'openrouter',
        input_tokens: 14,
        output_tokens: 3,
        cost: 0.0017,
        latency_ms: 420,
        input_token_details: { cache_read: 6, cache_creation: 2 },
      },
      { model: 'other', provider: 'openrouter', usage_type: 'subagent', input_tokens: 80 },
    ]);
    expect(result).toEqual({
      traceId: 'trace-1',
      decisionId: 'decision-1',
      selectedModel: 'b:free',
      selectedProvider: 'openrouter',
      resolvedProvider: 'openrouter',
      resolvedModel: 'b:free',
      fallbackUsed: false,
      authorizedBindings: [{ provider: 'openrouter', model: 'b:free' }],
      modelCalls: [
        {
          usageModel: 'b:free',
          provider: 'openrouter',
          inputTokens: 14,
          outputTokens: 3,
          costUsd: 0.0017,
          latencyMs: 420,
          cacheReadTokens: 6,
          cacheWriteTokens: 2,
        },
      ],
      total: {
        inputTokens: 14,
        outputTokens: 3,
        costUsd: 0.0017,
        costKnown: true,
        latencyMs: 420,
        latencyKnown: true,
        cacheReadTokens: 6,
        cacheReadKnown: true,
        cacheWriteTokens: 2,
        cacheWriteKnown: true,
      },
    });
  });
  it('attributes explicit cross-provider usage to the selected provider', () => {
    const result = projectHostModelUsage(
      {
        ...decision,
        selectedModel: 'claude-sonnet',
        selectedProvider: 'anthropic',
        authorizedBindings: [
          { bindingId: 'primary', provider: 'anthropic', model: 'claude-sonnet' },
          { bindingId: 'fallback', provider: 'openrouter', model: 'claude-sonnet' },
        ],
      },
      [
        {
          agentId: 'agent-primary',
          model: 'claude-sonnet',
          provider: 'anthropic',
          input_tokens: 21,
          output_tokens: 5,
          cost: 0.0026,
          latency_ms: 310,
        },
        {
          agentId: 'agent-primary',
          model: 'claude-sonnet',
          provider: 'openrouter',
          input_tokens: 999,
          latency_ms: 125,
        },
      ],
    );
    expect(result).toEqual({
      traceId: 'trace-1',
      decisionId: 'decision-1',
      selectedModel: 'claude-sonnet',
      selectedProvider: 'anthropic',
      resolvedProvider: 'openrouter',
      resolvedModel: 'claude-sonnet',
      fallbackUsed: true,
      authorizedBindings: [
        { provider: 'anthropic', model: 'claude-sonnet' },
        { provider: 'openrouter', model: 'claude-sonnet' },
      ],
      modelCalls: [
        {
          usageModel: 'claude-sonnet',
          provider: 'anthropic',
          inputTokens: 21,
          outputTokens: 5,
          costUsd: 0.0026,
          latencyMs: 310,
        },
        {
          usageModel: 'claude-sonnet',
          provider: 'openrouter',
          inputTokens: 999,
          latencyMs: 125,
        },
      ],
      total: {
        inputTokens: 1020,
        outputTokens: 5,
        costUsd: 0.0026,
        costKnown: false,
        latencyMs: 435,
        latencyKnown: true,
        cacheReadTokens: 0,
        cacheReadKnown: false,
        cacheWriteTokens: 0,
        cacheWriteKnown: false,
      },
    });
  });

  it('attributes only primary calls from the selected agent', () => {
    const observed = projectHostModelUsage({ ...decision, agentId: 'agent-primary' }, [
      { agentId: 'agent-connected', model: 'other', provider: 'openrouter', input_tokens: 99 },
      { agentId: 'agent-primary', model: 'b:free', provider: 'openrouter', input_tokens: 14 },
    ]);
    expect(observed.modelCalls).toEqual([
      { usageModel: 'b:free', provider: 'openrouter', inputTokens: 14 },
    ]);
  });
  it('adds bounded routing context to the same usage receipt without secrets', () => {
    const result = projectHostModelUsage(
      {
        ...decision,
        selectedBindingId: 'free-primary',
        routingMode: 'adaptive',
        spendingPolicy: 'free_first',
        authorizedBindings: [
          { bindingId: 'free-primary', provider: 'openrouter', model: 'b:free' },
          { bindingId: 'fallback', provider: 'Gemini', model: 'models/gemini-3.5-flash' },
        ],
      },
      [
        {
          agentId: 'agent-primary',
          model: 'b:free',
          provider: 'openrouter',
          input_tokens: 7,
          output_tokens: 2,
          cost: 0,
        },
      ],
    );

    expect(result).toMatchObject({
      selectedBindingId: 'free-primary',
      routingMode: 'adaptive',
      spendingPolicy: 'free_first',
      total: {
        inputTokens: 7,
        outputTokens: 2,
        costUsd: 0,
        costKnown: true,
        latencyMs: 0,
        latencyKnown: false,
        cacheReadTokens: 0,
        cacheReadKnown: false,
        cacheWriteTokens: 0,
        cacheWriteKnown: false,
      },
    });
    expect(JSON.stringify(result)).not.toContain('apiKey');
  });

  it('keeps a mismatch visible and excludes secrets and unbounded values', () => {
    const result = projectHostModelUsage(
      {
        ...decision,
        authorizedBindings: [
          { bindingId: 'selected', provider: 'openrouter', model: 'provider-alias' },
        ],
      },
      [
        {
          agentId: 'agent-primary',
          model: 'provider-alias',
          provider: 'openrouter',
          input_tokens: 2,
          apiKey: 'secret',
        },
        { model: 'x'.repeat(300), provider: 'openrouter', input_tokens: 9 },
      ],
    );
    expect(result.modelCalls).toEqual([
      { usageModel: 'provider-alias', provider: 'openrouter', inputTokens: 2 },
    ]);
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(projectHostModelUsage(decision, [])).toBeUndefined();
  });
});
