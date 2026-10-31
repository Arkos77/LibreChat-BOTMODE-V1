const {
  createNativeMissionCapabilityAttestation,
  assertNativeMissionCapabilityAttestation,
} = require('./nativeMissionCapabilityAttestation');
const {
  createNativeMissionOriginalChildCheckpointReader,
} = require('./nativeMissionOriginalChildCheckpointReader');

describe('native 4C cold recovery admission must not confuse graph and detached delegation', () => {
  const plan = {
    planId: 'signed-plan',
    tasks: [
      { key: 'research', agentId: 'research-agent', nodeId: 'node-research' },
      { key: 'analysis', agentId: 'analysis-agent', nodeId: 'node-analysis',
        dependsOn: ['research'] },
    ],
  };
  const modelAgent = (id) => ({
    id, provider: 'openrouter', model: 'ci-model:free',
    tools: [], toolDefinitions: [], toolRegistry: new Map(),
  });
  const specialists = [modelAgent('research-agent'), modelAgent('analysis-agent')];

  it('requires receipts for the original Worker with real delegated subagent capability', () => {
    const agents = [
      { ...modelAgent('worker'), subagents: { enabled: true,
          agent_ids: ['research-agent', 'analysis-agent'] } },
      ...specialists,
    ];
    const recorded = createNativeMissionCapabilityAttestation({
      plan, agents, subagentTasks: { store: {} },
    });
    expect(recorded.mode).toBe('receipts_required');
    expect(() => assertNativeMissionCapabilityAttestation({
      recorded: { ...recorded, mode: 'model_only' },
      plan, agents, subagentTasks: { store: {} },
    })).toThrow('NATIVE_MISSION_CAPABILITY_BASELINE_CHANGED');
  });

  it('allows only genuinely model-only native graph bindings', () => {
    const agents = [modelAgent('worker'), ...specialists];
    const recorded = createNativeMissionCapabilityAttestation({
      plan, agents, subagentTasks: undefined,
    });
    expect(recorded.mode).toBe('model_only');
    expect(assertNativeMissionCapabilityAttestation({
      recorded, plan, agents, subagentTasks: undefined,
    })).toEqual(recorded);
    expect(() => assertNativeMissionCapabilityAttestation({
      recorded, plan,
      agents: [{ ...agents[0], subagents: { enabled: true } }, ...specialists],
      subagentTasks: undefined,
    })).toThrow('NATIVE_MISSION_CAPABILITY_BASELINE_CHANGED');
  });

  it('does not classify external tools or host effects as model-only', () => {
    const toolAgent = { ...modelAgent('research-agent'), tools: [{ name: 'web_search' }] };
    expect(createNativeMissionCapabilityAttestation({
      plan, agents: [modelAgent('worker'), toolAgent, modelAgent('analysis-agent')],
      subagentTasks: undefined,
    }).mode).toBe('receipts_required');
    expect(createNativeMissionCapabilityAttestation({
      plan, agents: [modelAgent('worker'), ...specialists],
      subagentTasks: undefined, hostEffectPathsPresent: true,
    }).mode).toBe('receipts_required');
  });

  it('never accepts a direct native root graph checkpoint as a detached-child receipt', async () => {
    const getCheckpointer = jest.fn();
    const reader = createNativeMissionOriginalChildCheckpointReader({
      getCheckpointer,
      getConvo: jest.fn(),
      getStartReceipt: jest.fn(),
      assertGenerationNamespace: jest.fn(),
    });
    await expect(reader({
      userId: 'owner',
      parentConversationId: 'conversation',
      parentRunId: 'response',
      parentToolCallId: 'tool-call',
      childThreadId: 'child',
      taskId: 'task',
      attemptKey: 'attempt',
      agentId: 'research-agent',
      provider: 'openrouter',
      model: 'ci-model:free',
      graphThreadId: 'conversation',
      checkpointId: 'saved-checkpoint',
      checkpointNs: '',
      generationNamespace: 'epoch',
    })).rejects.toThrow('NATIVE_ORIGINAL_CHECKPOINT_SCOPE_INVALID');
    expect(getCheckpointer).not.toHaveBeenCalled();
  });
});
