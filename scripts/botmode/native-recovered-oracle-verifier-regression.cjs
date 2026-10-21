'use strict';
const assert = require('node:assert/strict');
const {
  createNativeMissionRecoveredOracleVerifier,
} = require('../../api/server/services/Endpoints/agents/nativeMissionRecoveredOracleVerifier');
(async () => {
  const candidate = { streamId: 'thread', createdAt: 1700000000000, checkpointNamespace: 'epoch' };
  const tasks = [
    { taskId: 'mission/worker', nodeId: 'p6_worker', agentId: 'worker', validation: [{}] },
    {
      taskId: 'mission/specialist',
      nodeId: 'p6_specialist',
      agentId: 'specialist',
      validation: [{}],
    },
  ];
  const plan = { mission: { missionId: 'mission' }, tasks };
  const makeJob = () => ({
    ...candidate,
    status: 'running',
    providerDrained: false,
    providerExecutionId: 'provider',
    providerExecutionStartedId: 'provider',
    orchestratorPlan: plan,
  });
  let job = makeJob();
  let pending = false;
  let reject = false;
  let rejectionMetadata;
  let writes = 0;
  const graph = {
    getState: async (config) => {
      assert.equal(config.configurable.thread_id, candidate.streamId);
      assert.equal(config.configurable.__librechat_mission_sync, true);
      return {
        next: pending ? ['p6_specialist'] : [],
        tasks: pending ? [{ name: 'p6_specialist' }] : [],
        values: {
          agentOutputs: {
            p6_worker: { content: '{"ok":true}' },
            p6_specialist: { content: '{"ok":true}' },
          },
        },
      };
    },
  };
  const store = { getJob: async () => structuredClone(job) };
  const client = {
    orchestratorPlan: plan,
    options: {
      nativeMissionRecoveredOraclePersister: async (result) => {
        writes++;
        job.missionOracleState = {
          evidence: {},
          results: { ...job.missionOracleState?.results, [result.taskId]: structuredClone(result) },
        };
        return structuredClone(job.missionOracleState);
      },
    },
  };
  const verifier = () =>
    createNativeMissionRecoveredOracleVerifier({
      store,
      client,
      graph,
      candidate,
      assertAuthorized: async () => {},
      validateMissionTask: async (task) => ({
        taskId: task.taskId,
        nodeId: task.nodeId,
        verdicts: [
          {
            status: reject && task.agentId === 'specialist' ? 'REJECTED' : 'VERIFIED',
            ...(reject && task.agentId === 'specialist'
              ? {
                  reasons: rejectionMetadata ?? [
                    { code: 'INVALID_CANDIDATE', detail: 'private-text' },
                  ],
                }
              : {}),
          },
        ],
      }),
      areMissionOracleResultsEquivalent: (a, b) => JSON.stringify(a) === JSON.stringify(b),
      normalizeOracleState: (state) => structuredClone(state),
    });
  await verifier()();
  assert.deepEqual(
    Object.keys(job.missionOracleState.results).sort(),
    tasks.map((t) => t.taskId).sort(),
  );
  assert.equal(writes, 2);
  console.log('BOTMODE_RECOVERED_ORACLE_FULL_GRAPH_VERIFIED=PASS');
  job = makeJob();
  pending = true;
  await assert.rejects(verifier()(), /GRAPH_NOT_TERMINAL/);
  pending = false;
  reject = true;
  await assert.rejects(verifier()(), (error) => {
    assert.match(error.message, /VERDICT_DENIED.*INVALID_CANDIDATE/);
    assert.equal(
      error.message.includes('private-text'),
      false,
      'never leak model content or validator detail to public CI diagnostics',
    );
    return true;
  });
  rejectionMetadata = [{ code: 'UNSAFE_CANARY_SECRET', detail: 'private-text' }];
  await assert.rejects(verifier()(), (error) => {
    assert.match(error.message, /UNRECOGNIZED/);
    assert.equal(error.message.includes('UNSAFE_CANARY_SECRET'), false);
    assert.equal(error.message.includes('private-text'), false);
    return true;
  });
  rejectionMetadata = undefined;
  reject = false;
  job = { ...makeJob(), status: 'aborted' };
  await assert.rejects(verifier()(), /JOB_DENIED/);
  job = {
    ...makeJob(),
    missionOracleState: {
      evidence: {},
      results: {
        'mission/worker': {
          taskId: 'mission/worker',
          nodeId: 'p6_worker',
          verdicts: [{ status: 'REJECTED' }],
        },
      },
    },
  };
  await assert.rejects(verifier()(), /REPLAY_CONFLICT/);
  console.log('BOTMODE_RECOVERED_ORACLE_DENIALS=PASS');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
