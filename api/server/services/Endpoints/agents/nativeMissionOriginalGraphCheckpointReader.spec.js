'use strict';

const {
  createNativeMissionOriginalGraphCheckpointReader,
} = require('./nativeMissionOriginalGraphCheckpointReader');

const scope = {
  streamId: 'original-conversation',
  checkpointNamespace: 'original-generation',
  nodeId: 'node-analysis',
  taskId: 'task-analysis',
  agentId: 'analyst',
};
const plan = {
  tasks: [
    { key: 'research', nodeId: 'node-research', taskId: 'task-research',
      agentId: 'researcher', dependsOn: [] },
    { key: 'analysis', nodeId: 'node-analysis', taskId: 'task-analysis',
      agentId: 'analyst', dependsOn: ['research'] },
  ],
};
const state = {
  config: { configurable: {
    thread_id: scope.streamId,
    checkpoint_ns: '',
    __librechat_checkpoint_ns: scope.checkpointNamespace,
    checkpoint_id: 'original-checkpoint',
  } },
  next: ['node-analysis'],
  tasks: [{ name: 'node-analysis', interrupts: [], error: null }],
  values: { agentOutputs: { 'node-research': { content: 'original result' } } },
};
function setup(overrides = {}) {
  const getState = jest.fn().mockResolvedValue(state);
  const getGraph = jest.fn().mockResolvedValue({ getState });
  const reader = createNativeMissionOriginalGraphCheckpointReader({ getGraph, ...overrides });
  return { reader, getState, getGraph };
}

describe('original persisted native graph node checkpoint reader', () => {
  it('reads the actual SDK next/tasks and proves completed Research before pending Analyse', async () => {
    const { reader, getGraph, getState } = setup();
    const result = await reader({ scope, plan, expectedCheckpointId: 'original-checkpoint' });
    expect(result).toEqual({
      threadId: scope.streamId,
      checkpointNamespace: scope.checkpointNamespace,
      checkpointId: 'original-checkpoint',
      pendingNodes: ['node-analysis'],
    });
    expect(getGraph).toHaveBeenCalledWith({ scope, plan });
    expect(getState).toHaveBeenCalledWith({
      configurable: {
        thread_id: scope.streamId,
        checkpoint_ns: '',
        __librechat_checkpoint_ns: scope.checkpointNamespace,
        __librechat_mission_sync: true,
      },
    });
  });

  it('rejects substituted generation, conversation, checkpoint, next task and interrupt', async () => {
    const invalid = [
      { config: { configurable: { ...state.config.configurable, checkpoint_id: 'other' } } },
      { config: { configurable: { ...state.config.configurable, thread_id: 'other' } } },
      { config: { configurable: { ...state.config.configurable,
        __librechat_checkpoint_ns: 'other-generation' } } },
      { next: [] },
      { next: ['node-research'] },
      { next: ['node-analysis', 'unknown'] },
      { tasks: [] },
      { tasks: [{ name: 'node-analysis', interrupts: ['paused'] }] },
      { tasks: [{ name: 'node-analysis', interrupts: [], error: 'crashed' }] },
      { tasks: [{ name: 'node-research', interrupts: [] }] },
      { values: { agentOutputs: { 'node-analysis': { content: 'already complete' },
        'node-research': { content: 'original' } } } },
      { values: { agentOutputs: {} } },
    ];
    for (const patch of invalid) {
      const reader = createNativeMissionOriginalGraphCheckpointReader({
        getGraph: async () => ({ getState: async () => ({ ...state, ...patch }) }),
      });
      await expect(reader({ scope, plan, expectedCheckpointId: 'original-checkpoint' }))
        .rejects.toThrow(/NATIVE_GRAPH_CHECKPOINT_/);
    }
  });

  it('refuses unknown or altered original planned task lineage before reading graph', async () => {
    const { reader, getGraph } = setup();
    for (const altered of [
      { ...scope, nodeId: 'foreign' },
      { ...scope, agentId: 'worker' },
      { ...scope, taskId: 'substituted-task' },
    ]) {
      await expect(reader({ scope: altered, plan }))
        .rejects.toThrow('NATIVE_GRAPH_CHECKPOINT_NODE_NOT_PLANNED');
    }
    await expect(reader({ scope, plan: { tasks: [plan.tasks[0]] } }))
      .rejects.toThrow('NATIVE_GRAPH_CHECKPOINT_ORIGINAL_SCOPE_DENIED');
    await expect(reader({ scope, plan, expectedCheckpointId: 1 }))
      .rejects.toThrow('NATIVE_GRAPH_CHECKPOINT_ORIGINAL_SCOPE_DENIED');
    expect(getGraph).not.toHaveBeenCalled();
    expect(() => createNativeMissionOriginalGraphCheckpointReader({}))
      .toThrow('NATIVE_GRAPH_CHECKPOINT_GRAPH_READER_MISSING');
  });
});
