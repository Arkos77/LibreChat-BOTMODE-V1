import {
  inspectReconstructedNativeMissionGraph,
  readQualifiedReconstructedNativeMissionSnapshot,
} from './nativeMissionRecoverySnapshot';

const candidate = {
  streamId: 'mission-1',
  checkpointNamespace: 'generation-1',
  checkpointId: 'head-1',
};
const state = {
  config: { configurable: { thread_id: 'mission-1', checkpoint_id: 'head-1' } },
  next: ['worker'],
  tasks: [{ name: 'worker', interrupts: [] as unknown[] }],
};

describe('reconstructed native mission read-only qualification', () => {
  it('reads the exact generation-scoped head without invoking the graph', async () => {
    const graph = { getState: jest.fn(async () => state), invoke: jest.fn() };
    await expect(
      inspectReconstructedNativeMissionGraph(graph, candidate, ['worker']),
    ).resolves.toEqual({
      checkpointId: 'head-1',
      pendingNodes: ['worker'],
    });
    expect(graph.getState).toHaveBeenCalledWith({
      configurable: {
        thread_id: 'mission-1',
        checkpoint_ns: '',
        __librechat_checkpoint_ns: 'generation-1',
      },
    });
    expect(graph.invoke).not.toHaveBeenCalled();
  });

  it('preserves the exact SDK state and refuses interrupted tasks', async () => {
    const graph = { getState: jest.fn(async () => state) };
    await expect(
      readQualifiedReconstructedNativeMissionSnapshot(graph, candidate, ['worker']),
    ).resolves.toBe(state);
    const interrupted = { ...state, tasks: [{ name: 'worker', interrupts: [{ id: 'approval' }] }] };
    graph.getState.mockResolvedValueOnce(interrupted);
    await expect(
      readQualifiedReconstructedNativeMissionSnapshot(graph, candidate, ['worker']),
    ).resolves.toBeNull();
  });

  it('fails closed for an unknown planned node', async () => {
    const graph = { getState: jest.fn(async () => state) };
    await expect(
      inspectReconstructedNativeMissionGraph(graph, candidate, ['specialist']),
    ).resolves.toBeNull();
  });

  it('fails closed on HITL interruptions or a different Mongo head', async () => {
    const graph = {
      getState: jest.fn(async () => ({
        ...state,
        tasks: [{ name: 'worker', interrupts: ['approval'] }],
      })),
    };
    await expect(
      inspectReconstructedNativeMissionGraph(graph, candidate, ['worker']),
    ).resolves.toBeNull();
    graph.getState.mockResolvedValueOnce({
      ...state,
      config: { configurable: { thread_id: 'mission-1', checkpoint_id: 'other-head' } },
    });
    await expect(
      inspectReconstructedNativeMissionGraph(graph, candidate, ['worker']),
    ).resolves.toBeNull();
  });
});
