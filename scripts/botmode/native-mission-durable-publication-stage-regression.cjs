'use strict';
const assert = require('node:assert/strict');
const {
  createNativeMissionDurablePublicationStage,
} = require('../../api/server/services/Endpoints/agents/nativeMissionDurablePublicationStage');

(async () => {
  const identity = {
    streamId: 'mission',
    createdAt: 1700000000000,
    ownerToken: 'owner-123456789123456',
    providerExecutionId: 'provider-123456789',
    checkpointNamespace: 'ns',
  };
  // These are the actual identities from deterministicPlanner.planMission:
  // task.key is the short objective name; task.taskId is what Oracle records.
  const tasks = [
    { key: 'worker', taskId: 'mission/worker', nodeId: 'p6_worker', validation: [{}] },
    { key: 'specialist', taskId: 'mission/specialist', nodeId: 'p6_specialist', validation: [{}] },
  ];
  const verdict = (task) => ({
    taskId: task.taskId,
    nodeId: task.nodeId,
    verdicts: [{ status: 'VERIFIED' }],
  });
  const candidate = {
    content: [{ type: 'text', text: 'approved' }],
    attachments: [],
    oracle: {
      evidence: {},
      results: Object.fromEntries(tasks.map((task) => [task.taskId, verdict(task)])),
    },
  };
  let job = {
    createdAt: identity.createdAt,
    checkpointNamespace: identity.checkpointNamespace,
    status: 'running',
    providerExecutionId: identity.providerExecutionId,
    orchestratorPlan: { tasks },
    missionOracleState: structuredClone(candidate.oracle),
  };
  let writes = 0;
  const store = {
    updateRecoveredMissionEvidence: async (...args) => {
      assert.deepEqual(args.slice(0, 4), [
        identity.streamId,
        identity.createdAt,
        identity.ownerToken,
        identity.providerExecutionId,
      ]);
      writes++;
      job = { ...job, ...args[4] };
      return true;
    },
    getJob: async () => job,
  };
  const stage = (input = candidate, override = store) =>
    createNativeMissionDurablePublicationStage({
      store: override,
      identity,
      getCandidate: async () => input,
    })();

  await stage();
  assert.equal(writes, 1);
  assert.deepEqual(job.missionOracleState, candidate.oracle);
  assert.deepEqual(job.missionCandidateContent, candidate.content);
  console.log('BOTMODE_DURABLE_PUBLICATION_REAL_TASK_IDS=PASS');

  await assert.rejects(
    stage(candidate, {
      ...store,
      updateRecoveredMissionEvidence: async () => false,
    }),
    /OWNER_LOST/,
  );
  await assert.rejects(
    stage(candidate, {
      ...store,
      getJob: async () => ({ ...job, missionCandidateContent: [] }),
    }),
    /NOT_VERIFIED/,
  );
  await assert.rejects(stage({ content: [] }), /UNAVAILABLE/);

  async function denied(mutated, label) {
    const priorWrites = writes;
    await assert.rejects(stage(mutated), /ORACLE_UNVERIFIED/);
    assert.equal(writes, priorWrites, `a rejected ${label} must not stage content`);
  }

  await denied(
    {
      ...candidate,
      oracle: {
        ...candidate.oracle,
        results: {
          ...candidate.oracle.results,
          [tasks[1].taskId]: {
            ...verdict(tasks[1]),
            verdicts: [{ status: 'REJECTED' }],
          },
        },
      },
    },
    'Oracle verdict differing from the original persisted state',
  );
  await denied(
    {
      ...candidate,
      oracle: {
        ...candidate.oracle,
        results: {
          ...candidate.oracle.results,
          [tasks[1].taskId]: {
            ...verdict(tasks[1]),
            // A substituted VERIFIED answer is not the Redis-persisted one.
            verdicts: [{ status: 'VERIFIED', validator: { id: 'fabricated' } }],
          },
        },
      },
    },
    'fabricated VERIFIED result',
  );
  // This same result array is all VERIFIED but does not prove both policy
  // requirements were evaluated. Reject before any Redis write.
  const previousPlan = job.orchestratorPlan;
  job.orchestratorPlan = {
    tasks: previousPlan.tasks.map((task, index) =>
      index === 1 ? { ...task, validation: [{}, {}] } : task,
    ),
  };
  await denied(candidate, 'partial requirement coverage');
  job.orchestratorPlan = previousPlan;

  await denied(
    {
      ...candidate,
      oracle: {
        ...candidate.oracle,
        // The old code incorrectly accepted these short objective keys.
        results: Object.fromEntries(
          tasks.map((task) => [
            task.key,
            {
              ...verdict(task),
              taskId: task.key,
            },
          ]),
        ),
      },
    },
    'short objective IDs',
  );

  await denied(
    {
      ...candidate,
      oracle: { ...candidate.oracle, results: { [tasks[0].taskId]: verdict(tasks[0]) } },
    },
    'missing specialist',
  );

  await denied(
    {
      ...candidate,
      oracle: {
        ...candidate.oracle,
        results: {
          ...candidate.oracle.results,
          'mission/foreign': {
            taskId: 'mission/foreign',
            nodeId: 'foreign',
            verdicts: [{ status: 'VERIFIED' }],
          },
        },
      },
    },
    'extraneous task',
  );

  await denied(
    {
      ...candidate,
      oracle: {
        ...candidate.oracle,
        results: {
          ...candidate.oracle.results,
          [tasks[1].taskId]: { ...verdict(tasks[1]), nodeId: tasks[0].nodeId },
        },
      },
    },
    'mismatched node',
  );

  await denied(
    {
      ...candidate,
      oracle: {
        ...candidate.oracle,
        results: {
          ...candidate.oracle.results,
          [tasks[1].taskId]: {
            ...verdict(tasks[1]),
            verdicts: [{ status: 'REJECTED' }],
          },
        },
      },
    },
    'rejected verdict',
  );

  console.log('BOTMODE_DURABLE_PUBLICATION_STAGING_OWNER_AND_READBACK=PASS');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
