const { createNativeMissionRecoveryCoordinator } = require('./nativeMissionRecoveryCoordinator');

function fixture(execute) {
  const candidate = {
    streamId: 'cold-recovery-test',
    createdAt: 123456,
    checkpointNamespace: 'namespace-123',
    checkpointId: 'checkpoint-1',
  };
  const claim = { ...candidate, ownerToken: 'owner-claim-123456789abcdef' };
  const job = {
    ...candidate,
    status: 'running',
    orchestratorPlan: { tasks: [{ nodeId: 'node-1', agentId: 'agent-1', key: 'task-1' }] },
  };
  const store = {
    getJob: jest.fn().mockResolvedValue(job),
    releaseDrainedMissionRecovery: jest.fn().mockResolvedValue(true),
  };
  const manager = {
    getJobStore: () => store,
    claimCheckpointedOrphanForInspection: jest.fn().mockResolvedValue(claim),
  };
  const reconstruct = jest.fn().mockResolvedValue({
    graph: { getState: jest.fn() },
    assertReplaySafe: jest.fn(),
    assertEffectFencesReady: jest.fn().mockResolvedValue(undefined),
    verifyOracle: jest.fn(),
    getPublicationCandidate: jest.fn(),
    publishTerminal: jest.fn(),
  });
  const recover = createNativeMissionRecoveryCoordinator({
    manager,
    authorizeCandidate: jest.fn().mockResolvedValue(true),
    reconstruct,
    execute,
    continueColdGraph: jest.fn(),
    log: { warn: jest.fn() },
  });
  return { recover, candidate, store, reconstruct };
}

describe('native mission recovery claim cleanup', () => {
  it('keeps promoted ownership on an executor exception', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('PROVIDER_DIED_AFTER_PROMOTION'));
    const { recover, candidate, store } = fixture(execute);
    await expect(recover(candidate)).rejects.toThrow('PROVIDER_DIED_AFTER_PROMOTION');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(store.releaseDrainedMissionRecovery).not.toHaveBeenCalled();
  });

  it('keeps promoted ownership after an indeterminate executor acknowledgement', async () => {
    const execute = jest.fn().mockResolvedValue(undefined);
    const { recover, candidate, store } = fixture(execute);
    await expect(recover(candidate)).rejects.toThrow('NATIVE_RECOVERY_HANDOFF_INDETERMINATE');
    expect(store.releaseDrainedMissionRecovery).not.toHaveBeenCalled();
  });

  it('leaves refused SDK qualification cleanup to the manager', async () => {
    const execute = jest.fn().mockResolvedValue(false);
    const { recover, candidate, store } = fixture(execute);
    await expect(recover(candidate)).resolves.toBe(false);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(store.releaseDrainedMissionRecovery).not.toHaveBeenCalled();
  });

  it('releases only an unpromoted preflight claim', async () => {
    const execute = jest.fn();
    const { recover, candidate, store, reconstruct } = fixture(execute);
    reconstruct.mockResolvedValue(null);
    await expect(recover(candidate)).resolves.toBe(false);
    expect(execute).not.toHaveBeenCalled();
    expect(store.releaseDrainedMissionRecovery).toHaveBeenCalledWith(
      candidate.streamId,
      candidate.createdAt,
      'owner-claim-123456789abcdef',
    );
  });
});
