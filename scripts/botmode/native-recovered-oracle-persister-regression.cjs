'use strict';
const assert = require('node:assert/strict');
const {
  createNativeMissionRecoveredOraclePersister,
} = require('../../api/server/services/Endpoints/agents/nativeMissionRecoveredOraclePersister');

(async () => {
  const candidate = {
    streamId: 'mission',
    createdAt: 1700000000000,
    checkpointNamespace: 'epoch',
    checkpointId: 'head',
  };
  const claim = { ...candidate, ownerToken: 'recover-owner-123456789' };
  const tasks = [
    { key: 'worker', taskId: 'mission/worker', nodeId: 'p6_worker', validation: [{}] },
    { key: 'specialist', taskId: 'mission/specialist', nodeId: 'p6_specialist', validation: [{}] },
  ];
  const makeJob = () => ({
    ...candidate,
    status: 'running',
    pendingAction: null,
    providerDrained: false,
    providerExecutionId: 'recovered-provider-123456789',
    providerExecutionStartedId: 'recovered-provider-123456789',
    orchestratorPlan: { tasks },
  });
  let job = makeJob();
  let writes = 0;
  let authorized = true;
  const store = {
    getJob: async () => structuredClone(job),
    updateRecoveredMissionEvidence: async (id, createdAt, owner, provider, patch) => {
      assert.deepEqual(
        [id, createdAt, owner, provider],
        [candidate.streamId, candidate.createdAt, claim.ownerToken, job.providerExecutionId],
      );
      writes++;
      job.missionOracleState = structuredClone(patch.missionOracleState);
      return true;
    },
  };
  const create = (overrides = {}) =>
    createNativeMissionRecoveredOraclePersister({
      store,
      candidate,
      claim,
      assertAuthorized: async () => {
        if (!authorized) throw new Error('OWNER_PERMISSION_REVOKED');
      },
      normalizeOracleState: (state) => {
        assert.equal(typeof state.evidence, 'object');
        assert.equal(typeof state.results, 'object');
        assert.ok(
          Object.values(state.results).every((r) =>
            tasks.some((task) => r.taskId === task.taskId && r.nodeId === task.nodeId),
          ),
        );
        return structuredClone(state);
      },
      ...overrides,
    });
  const persist = create();
  const worker = {
    taskId: tasks[0].taskId,
    nodeId: tasks[0].nodeId,
    verdicts: [{ status: 'VERIFIED' }],
  };
  const specialist = {
    taskId: tasks[1].taskId,
    nodeId: tasks[1].nodeId,
    verdicts: [{ status: 'VERIFIED' }],
  };
  await Promise.all([persist(worker), persist(specialist)]);
  assert.deepEqual(
    Object.keys(job.missionOracleState.results).sort(),
    [worker.taskId, specialist.taskId].sort(),
  );
  assert.equal(writes, 2);
  await persist(worker);
  assert.equal(writes, 3, 'idempotent readback must still prove current owner with Redis CAS');
  console.log('BOTMODE_RECOVERED_ORACLE_WORKER_SPECIALIST_OWNER_CAS=PASS');

  const before = writes;
  await assert.rejects(persist({ ...worker, nodeId: 'foreign' }), /JOB_DENIED/);
  await assert.rejects(
    persist({ ...worker, verdicts: [{ status: 'REJECTED' }] }),
    /REPLAY_CONFLICT/,
  );
  assert.equal(writes, before);

  job = makeJob();
  const deniedOwner = create({
    store: { ...store, updateRecoveredMissionEvidence: async () => false },
  });
  await assert.rejects(deniedOwner(worker), /OWNER_LOST/);
  assert.equal(job.missionOracleState, undefined);

  job = { ...makeJob(), providerExecutionStartedId: 'old-provider' };
  await assert.rejects(persist(worker), /JOB_DENIED/);
  job = { ...makeJob(), status: 'aborted' };
  await assert.rejects(persist(worker), /JOB_DENIED/);
  job = makeJob();
  authorized = false;
  await assert.rejects(persist(worker), /OWNER_PERMISSION_REVOKED/);
  assert.equal(job.missionOracleState, undefined);
  console.log('BOTMODE_RECOVERED_ORACLE_REPLAY_AND_AUTH_DENIAL=PASS');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
