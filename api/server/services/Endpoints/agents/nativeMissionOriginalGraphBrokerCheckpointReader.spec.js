'use strict';
const {
  createNativeMissionLiveGraphCheckpointReader,
} = require('./nativeMissionOriginalGraphBrokerCheckpointReader');

const plan = { tasks: [
  { key: 'research', taskId: 'research-task', nodeId: 'research-node',
    agentId: 'researcher', dependsOn: [] },
  { key: 'analysis', taskId: 'analysis-task', nodeId: 'analysis-node',
    agentId: 'analyst', dependsOn: ['research'] },
] };
const scope = {
  streamId: 'original', checkpointNamespace: 'original-generation',
  generationCreatedAt: 1700000000000, responseMessageId: 'response',
  userId: 'owner', nodeId: 'analysis-node', taskId: 'analysis-task',
  agentId: 'analyst',
};
const snapshot = {
  config: { configurable: {
    thread_id: 'original', __librechat_checkpoint_ns: 'original-generation',
    checkpoint_id: 'checkpoint',
  } },
  next: ['analysis-node'],
  tasks: [{ name: 'analysis-node', interrupts: [], error: null }],
  values: { agentOutputs: { 'research-node': { content: 'durable' } } },
};
function client(snapshotOverride = snapshot) {
  const getState = jest.fn(async () => snapshotOverride);
  const graph = { getState };
  return {
    conversationId: 'original', responseMessageId: 'response',
    jobCreatedAt: 1700000000000, checkpointNamespace: 'original-generation',
    user: 'owner', orchestratorPlan: plan,
    run: { Graph: { createWorkflow: jest.fn(() => graph) } },
    getState,
  };
}
describe('native live graph checkpoint proof', () => {
  it('reads original running SDK graph and never invokes it', async () => {
    const active = client();
    const reader = createNativeMissionLiveGraphCheckpointReader();
    expect(await reader({ scope, plan, client: active })).toEqual({
      threadId: 'original', checkpointNamespace: 'original-generation',
      checkpointId: 'checkpoint', pendingNodes: ['analysis-node'],
    });
    expect(active.run.Graph.createWorkflow).toHaveBeenCalledTimes(1);
    expect(active.getState).toHaveBeenCalledTimes(1);
  });
  it('fails closed when a replay constructs a different runtime/mission', async () => {
    const reader = createNativeMissionLiveGraphCheckpointReader();
    for (const patch of [
      { conversationId: 'foreign' },
      { responseMessageId: 'foreign' },
      { jobCreatedAt: 1700000000001 },
      { checkpointNamespace: 'new-generation' },
      { user: 'foreign' },
      { orchestratorPlan: { tasks: [] } },
      { run: undefined },
    ]) {
      await expect(reader({ scope, plan, client: { ...client(), ...patch } }))
        .rejects.toThrow(/NATIVE_GRAPH_CHECKPOINT_/);
    }
  });
});
