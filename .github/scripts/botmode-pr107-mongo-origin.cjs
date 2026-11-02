'use strict';

const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const {
  saveNativeMissionWakeupOrigin,
  getNativeMissionWakeupOrigin,
  deleteNativeMissionWakeupOrigins,
} = require('../../api/server/services/Endpoints/agents/nativeMissionWakeupOriginStore');

const scope = {
  userId: 'ci-wakeup-user',
  tenantId: 'ci-wakeup-tenant',
  conversationId: 'ci-wakeup-conversation',
  parentResponseMessageId: 'ci-wakeup-original-response',
  agentId: 'ci-wakeup-worker',
};
const mission = {
  missionId: 'ci-wakeup-mission',
  taskId: 'ci-wakeup-root-task',
  objective: 'Verify durable asynchronous provenance',
};
const original = {
  ...scope,
  createdAt: 123456789,
  botMode: { version: 1, mode: 'analyze', workerAgentId: scope.agentId },
  orchestratorMission: { mission },
  plan: { planId: 'ci-wakeup-plan', mission, tasks: [] },
  capabilityAttestation: { agents: [scope.agentId], source: 'ci-offline' },
};
async function main() {
  const phase = process.argv[2];
  assert.ok(['seed', 'resume'].includes(phase), 'Expected seed or resume phase');
  await mongoose.connect('mongodb://127.0.0.1:27017/botmode_pr107_mongo_origin', {
    serverSelectionTimeoutMS: 15000,
  });
  try {
    const collection = mongoose.connection.collection('native_mission_wakeup_origins');
    if (phase === 'seed') {
      await deleteNativeMissionWakeupOrigins({ userId: scope.userId, tenantId: scope.tenantId });
      await saveNativeMissionWakeupOrigin(original);
      await saveNativeMissionWakeupOrigin(original);
      assert.equal(await collection.countDocuments(scope), 1, 'idempotent original mission');
      console.log('BOTMODE_REAL_MONGO_ORIGIN_SEED=PASS');
      return;
    }

    // This process is distinct from the writer: no process-local or Redis state is reused.
    const firstChild = await getNativeMissionWakeupOrigin(scope);
    const secondChild = await getNativeMissionWakeupOrigin(scope);
    assert.equal(firstChild.planId, original.plan.planId);
    assert.deepEqual(secondChild, firstChild, 'two sibling readers recover one immutable mission');
    assert.equal(
      await getNativeMissionWakeupOrigin({ ...scope, tenantId: 'foreign-tenant' }),
      null,
    );
    assert.equal(
      await getNativeMissionWakeupOrigin({ ...scope, agentId: 'foreign-agent' }),
      null,
    );
    const alteredMission = { ...mission, objective: 'Forged mission' };
    await assert.rejects(
      saveNativeMissionWakeupOrigin({
        ...original,
        orchestratorMission: { mission: alteredMission },
        plan: { ...original.plan, mission: alteredMission },
      }),
      /MISSION_ORIGIN_IMMUTABLE_CONFLICT/,
    );
    await collection.updateOne(scope, { $set: { 'plan.planId': 'forged-plan' } });
    await assert.rejects(
      getNativeMissionWakeupOrigin(scope),
      /MISSION_ORIGIN_INTEGRITY_FAILED/,
    );
    await deleteNativeMissionWakeupOrigins({
      userId: scope.userId,
      tenantId: scope.tenantId,
      conversationIds: [scope.conversationId],
    });
    assert.equal(await collection.countDocuments(scope), 0);
    console.log('BOTMODE_REAL_MONGO_RESTART_MULTI_CHILD_ISOLATION=PASS');
    console.log('BOTMODE_REAL_MONGO_IMMUTABILITY_TAMPER_CLEANUP=PASS');
  } finally {
    await mongoose.disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
