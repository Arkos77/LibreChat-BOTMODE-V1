const {
  deterministicPlanner,
  prepareBotModeMission,
  normalizeMissionOracleState,
  areMissionOracleResultsEquivalent,
  validateMissionTask,
} = require('@librechat/api');
const {
  createNativeMissionRecoveredOraclePersister,
} = require('./nativeMissionRecoveredOraclePersister');
const {
  createNativeMissionRecoveredOracleVerifier,
} = require('./nativeMissionRecoveredOracleVerifier');

function fixture() {
  const candidate = {
    streamId: 'source-recovery',
    createdAt: 1700000000000,
    checkpointNamespace: 'epoch',
    checkpointId: 'checkpoint',
  };
  const claim = { ...candidate, ownerToken: 'owner-recovery-123456789' };
  const plan = deterministicPlanner.planMission(
    prepareBotModeMission({
      missionId: candidate.streamId,
      taskId: 'root',
      objective: 'Research',
      requiredCapabilities: ['web_search'],
      constraints: [],
    }),
    {
      worker: {
        id: 'worker',
        agentId: 'saved-agent',
        role: 'worker',
        capabilities: ['web_search'],
        constraints: [],
      },
      specialists: [],
    },
  );
  const task = plan.tasks[0];
  const url = 'https://example.invalid/observed';
  const observation = { toolCallId: 'observed-call', urls: [url] };
  const content = JSON.stringify({ ok: true, result: `Observed source ${url}`, sources: url });
  let job = {
    ...candidate,
    status: 'running',
    providerDrained: false,
    providerExecutionId: 'provider-recovered',
    providerExecutionStartedId: 'provider-recovered',
    orchestratorPlan: plan,
    missionOracleState: {
      evidence: {},
      results: {},
      sources: { [task.taskId]: [observation] },
    },
  };
  let authorized = true,
    casAccepted = true,
    writes = 0;
  const assertAuthorized = async () => {
    if (!authorized) throw new Error('OWNER_REVOKED');
  };
  const store = {
    getJob: async () => structuredClone(job),
    updateRecoveredMissionEvidence: async (streamId, createdAt, ownerToken, providerId, patch) => {
      expect([streamId, createdAt, ownerToken, providerId]).toEqual([
        candidate.streamId,
        candidate.createdAt,
        claim.ownerToken,
        job.providerExecutionId,
      ]);
      if (!casAccepted) return false;
      writes++;
      job.missionOracleState = structuredClone(patch.missionOracleState);
      return true;
    },
  };
  const persist = createNativeMissionRecoveredOraclePersister({
    store,
    candidate,
    claim,
    assertAuthorized,
    normalizeOracleState: normalizeMissionOracleState,
    areMissionOracleResultsEquivalent,
  });
  const client = {
    orchestratorPlan: plan,
    options: { nativeMissionRecoveredOraclePersister: persist },
  };
  const verify = createNativeMissionRecoveredOracleVerifier({
    store,
    client,
    candidate,
    assertAuthorized,
    validateMissionTask,
    areMissionOracleResultsEquivalent,
    normalizeOracleState: normalizeMissionOracleState,
    graph: {
      getState: async () => ({
        next: [],
        tasks: [],
        values: { agentOutputs: { [task.nodeId]: { content } } },
      }),
    },
  });
  return {
    task,
    observation,
    persist,
    verify,
    job: () => structuredClone(job),
    writes: () => writes,
    setSources: (sources) => {
      job.missionOracleState.sources = sources;
    },
    revoke: () => {
      authorized = false;
    },
    denyCas: () => {
      casAccepted = false;
    },
    result: () =>
      validateMissionTask({
        taskId: task.taskId,
        nodeId: task.nodeId,
        agentId: task.agentId,
        candidate: content,
        requirements: task.validation,
        observedSources: [observation],
      }),
  };
}

describe('native recovered Oracle source observations', () => {
  it('preserves normalized observations through result persistence and idempotent replay', async () => {
    const f = fixture();
    const result = await f.result();
    expect(result.verdicts.every((v) => v.status === 'VERIFIED')).toBe(true);
    await f.persist(result);
    expect(f.job().missionOracleState.sources).toEqual({ [f.task.taskId]: [f.observation] });
    await f.persist({
      ...result,
      verdicts: result.verdicts.map((v) => ({ ...v, timestamp: '2026-10-24T20:00:00Z' })),
    });
    expect(f.job().missionOracleState.sources).toEqual({ [f.task.taskId]: [f.observation] });
    expect(f.job().missionOracleState.results[f.task.taskId]).toEqual(result);
    expect(f.writes()).toBe(2);
  });

  it('revalidates checkpoint output using the current task durable observations', async () => {
    const f = fixture();
    await expect(f.verify()).resolves.toBeUndefined();
    expect(f.writes()).toBe(1);
    expect(f.job().missionOracleState.sources).toEqual({ [f.task.taskId]: [f.observation] });
    expect(
      f
        .job()
        .missionOracleState.results[f.task.taskId].verdicts.every((v) => v.status === 'VERIFIED'),
    ).toBe(true);
  });

  it.each(['missing', 'foreign', 'malformed'])(
    'refuses %s observations before persistence',
    async (mode) => {
      const f = fixture();
      f.setSources(
        mode === 'missing'
          ? {}
          : mode === 'foreign'
            ? { foreign: [f.observation] }
            : { [f.task.taskId]: [{ ...f.observation, urls: ['javascript:invalid'] }] },
      );
      await expect(f.verify()).rejects.toThrow();
      expect(f.writes()).toBe(0);
      expect(f.job().missionOracleState.results).toEqual({});
    },
  );

  it.each(['revoked', 'cas-denied'])(
    'retains the %s persistence gate and sources',
    async (mode) => {
      const f = fixture();
      const before = f.job().missionOracleState;
      const result = await f.result();
      if (mode === 'revoked') f.revoke();
      else f.denyCas();
      await expect(f.persist(result)).rejects.toThrow(
        mode === 'revoked' ? 'OWNER_REVOKED' : 'OWNER_LOST',
      );
      expect(f.writes()).toBe(0);
      expect(f.job().missionOracleState).toEqual(before);
    },
  );
});
