'use strict';

const {
  createNativeMissionIndependentOriginalGraphCheckpointReader,
} = require('./nativeMissionIndependentOriginalGraphCheckpointReader');

const plan = {
  strategy: 'SEQUENTIAL',
  tasks: [
    { key: 'research', nodeId: 'research-node', taskId: 'research-task',
      agentId: 'researcher', dependsOn: [] },
    { key: 'analysis', nodeId: 'analysis-node', taskId: 'analysis-task',
      agentId: 'analyst', dependsOn: ['research'] },
  ],
};
const scope = {
  userId: 'owner', tenantId: '', conversationId: 'original-thread',
  responseMessageId: 'response', createdAt: 1700000000000,
  checkpointNamespace: 'original-generation', checkpointId: 'current-checkpoint',
  nodeId: 'analysis-node', taskId: 'analysis-task', agentId: 'analyst',
  provider: 'openrouter', model: 'openrouter/free',
  requestDigest: 'a'.repeat(64), plan,
};
const proof = {
  threadId: scope.conversationId,
  checkpointNamespace: scope.checkpointNamespace,
  checkpointId: scope.checkpointId,
  pendingNodes: [scope.nodeId],
};
const tuple = {
  config: { configurable: { thread_id: scope.conversationId } },
  checkpoint: {
    id: scope.checkpointId,
    channel_values: {
      agentOutputs: { 'research-node': { content: 'real durable research' } },
    },
  },
};
function setup(overrides = {}) {
  const intentStore = { readProof: jest.fn(async () => proof) };
  const saver = { getTuple: jest.fn(async () => tuple) };
  const getCheckpointer = jest.fn(async () => saver);
  const reader = createNativeMissionIndependentOriginalGraphCheckpointReader({
    intentStore, getCheckpointer, ...overrides,
  });
  return { reader, saver, intentStore, getCheckpointer };
}
describe('independent broker root checkpoint proof backed by original SDK intent', () => {
  it('requires the original SDK pending-node proof and CURRENT MongoDBSaver head', async () => {
    const { reader, saver, intentStore } = setup();
    expect(await reader(scope)).toEqual(proof);
    expect(intentStore.readProof).toHaveBeenCalledWith({
      identity: {
        mode: 'native_graph', userId: scope.userId, tenantId: scope.tenantId,
        streamId: scope.conversationId,
        responseMessageId: scope.responseMessageId,
        generationCreatedAt: scope.createdAt,
        checkpointNamespace: scope.checkpointNamespace,
        graphCheckpointId: scope.checkpointId,
        nodeId: scope.nodeId, taskId: scope.taskId, agentId: scope.agentId,
        provider: scope.provider, model: scope.model,
      },
      requestDigest: scope.requestDigest,
    });
    expect(saver.getTuple).toHaveBeenCalledWith({
      configurable: {
        thread_id: scope.conversationId, checkpoint_ns: '',
        __librechat_checkpoint_ns: scope.checkpointNamespace,
      },
    });
    expect(saver.getTuple.mock.calls[0][0].configurable)
      .not.toHaveProperty('checkpoint_id');
  });

  it('denies old heads, changed generation, missing original intent or incomplete Research', async () => {
    for (const altered of [
      { intentStore: { readProof: async () => null } },
      { intentStore: { readProof: async () => ({ ...proof, pendingNodes: ['research-node'] }) } },
      { getCheckpointer: async () => ({ getTuple: async () => ({
        ...tuple, checkpoint: { ...tuple.checkpoint, id: 'later-checkpoint' },
      }) }) },
      { getCheckpointer: async () => ({ getTuple: async () => ({
        ...tuple, checkpoint: {
          ...tuple.checkpoint,
          channel_values: { agentOutputs: { 'analysis-node': { content: 'done' },
            'research-node': { content: 'done' } } },
        },
      }) }) },
      { getCheckpointer: async () => ({ getTuple: async () => ({
        ...tuple, checkpoint: { ...tuple.checkpoint,
          channel_values: { agentOutputs: {} } },
      }) }) },
      { getCheckpointer: async () => undefined },
    ]) {
      const { reader } = setup(altered);
      await expect(reader(scope)).resolves.toBeNull();
    }
  });

  it('refuses any unverified branch, changed actor, task or nonsequential topology', async () => {
    const { reader, intentStore, getCheckpointer } = setup();
    const changes = [
      { ...scope, plan: { ...plan, strategy: 'PARALLEL' } },
      { ...scope, plan: { ...plan, tasks: plan.tasks.slice(0, 1) } },
      { ...scope, nodeId: 'research-node' },
      { ...scope, taskId: 'foreign-task' },
      { ...scope, agentId: 'foreign-agent' },
      { ...scope, plan: { ...plan, tasks: [
        plan.tasks[0], { ...plan.tasks[1], dependsOn: [] },
      ] } },
      { ...scope, plan: { ...plan, tasks: [...plan.tasks,
        { key: 'third', nodeId: 'third-node', taskId: 'third-task',
          agentId: 'third-agent' }] } },
    ];
    for (const changed of changes) {
      await expect(reader(changed)).resolves.toBeNull();
    }
    expect(intentStore.readProof).not.toHaveBeenCalled();
    expect(getCheckpointer).not.toHaveBeenCalled();
    expect(() => createNativeMissionIndependentOriginalGraphCheckpointReader({}))
      .toThrow('NATIVE_GRAPH_INDEPENDENT_CHECKPOINT_READER_DEPENDENCIES_MISSING');
  });
});
