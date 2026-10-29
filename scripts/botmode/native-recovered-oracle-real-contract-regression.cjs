'use strict';
// Run in the pinned qualification image with TypeScript's actual source and
// the real recovered Redis CAS persister mounted read-only. No external IO.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(
  '/work/packages/api/src/agents/orchestrator/missionOracle.ts',
  'utf8',
);
// Load the actual source-normalization contract, not a permissive mock.
const sourcesModule = { exports: {} };
const sourceContract = fs.readFileSync('/work/packages/api/src/agents/oracle/sources.ts', 'utf8');
const sourcesJs = ts.transpileModule(sourceContract, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(sourcesJs, {
  module: sourcesModule,
  exports: sourcesModule.exports,
  URL,
});
const mod = { exports: {} };
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(js, {
  module: mod,
  exports: mod.exports,
  structuredClone,
  require: (id) => {
    if (id === '../oracle/sources') return sourcesModule.exports;
    if (id === './toolEvidence')
      return {
        createNativeToolEvidence: () => {
          throw Error('unexpected tool evidence');
        },
      };
    if (id === '../oracle')
      return {
        deterministicOracle: {
          validate: async () => {
            throw Error('unexpected oracle model');
          },
        },
      };
    throw Error(`unexpected import ${id}`);
  },
});
const { normalizeMissionOracleState, areMissionOracleResultsEquivalent } = mod.exports;
const {
  createNativeMissionRecoveredOraclePersister,
} = require('/work/api/server/services/Endpoints/agents/nativeMissionRecoveredOraclePersister.js');

(async () => {
  const candidate = {
    streamId: 'recover',
    createdAt: 1700000000000,
    checkpointNamespace: 'owner-ns',
    checkpointId: 'mongo-head',
  };
  const claim = { ...candidate, ownerToken: 'original-recovered-owner-123' };
  const tasks = [
    {
      key: 'worker',
      taskId: 'mission/worker',
      nodeId: 'p6_worker',
      agentId: 'agent-worker',
      validation: [{ criteria: [{ id: 'check', field: 'value', expected: true }] }],
    },
    {
      key: 'specialist',
      taskId: 'mission/specialist',
      nodeId: 'p6_specialist',
      agentId: 'agent-specialist',
      validation: [{ criteria: [{ id: 'check', field: 'value', expected: true }] }],
    },
  ];
  const verdict = (task, timestamp = '2026-10-17T19:00:00.000Z') => ({
    taskId: task.taskId,
    nodeId: task.nodeId,
    verdicts: [
      {
        status: 'VERIFIED',
        input: {
          taskId: task.taskId,
          agentId: task.agentId,
          candidate: '{"value":true}',
          criteria: task.validation[0].criteria,
          evidence: [],
        },
        reasons: [{ code: 'CRITERION_MET', criterionId: 'check' }],
        checks: [{ criterionId: 'check', expected: true, actual: true, passed: true }],
        contradictions: [],
        uncertainty: [],
        validator: { id: 'deterministic', type: 'deterministic' },
        timestamp,
      },
    ],
  });
  let job = {
    ...candidate,
    status: 'running',
    providerDrained: false,
    providerExecutionId: 'provider-recovery-1',
    providerExecutionStartedId: 'provider-recovery-1',
    orchestratorPlan: { tasks },
  };
  let writes = 0;
  const store = {
    getJob: async () => structuredClone(job),
    updateRecoveredMissionEvidence: async (stream, epoch, owner, provider, patch) => {
      assert.deepEqual(
        [stream, epoch, owner, provider],
        [candidate.streamId, candidate.createdAt, claim.ownerToken, job.providerExecutionId],
      );
      writes++;
      job.missionOracleState = structuredClone(patch.missionOracleState);
      return true;
    },
  };
  const persist = createNativeMissionRecoveredOraclePersister({
    store,
    candidate,
    claim,
    assertAuthorized: async () => {},
    normalizeOracleState: normalizeMissionOracleState,
    areMissionOracleResultsEquivalent,
  });
  const [worker, specialist] = tasks.map((task) => verdict(task));
  await Promise.all([persist(worker), persist(specialist)]);
  assert.equal(writes, 2);
  normalizeMissionOracleState(job.missionOracleState);
  assert.deepEqual(
    Object.keys(job.missionOracleState.results).sort(),
    tasks.map((task) => task.taskId).sort(),
  );
  await persist(verdict(tasks[0], '2026-10-17T20:00:00.000Z'));
  assert.equal(writes, 3);
  assert.equal(
    job.missionOracleState.results[worker.taskId].verdicts[0].timestamp,
    '2026-10-17T19:00:00.000Z',
  );
  await assert.rejects(
    persist({ ...verdict(tasks[0]), verdicts: [{ ...worker.verdicts[0], status: 'REJECTED' }] }),
    /REPLAY_CONFLICT/,
  );
  assert.equal(writes, 3);
  await assert.rejects(
    persist({ ...verdict(tasks[0]), verdicts: [{ status: 'VERIFIED' }] }),
    /REPLAY_CONFLICT/,
  );
  console.log('BOTMODE_RECOVERED_ORACLE_REAL_SDK_SCHEMA_TIMESTAMP_REPLAY=PASS');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
