'use strict';
// Small, isolated real-Redis regression for the existing claim + status CAS.
// Requires a temporary Redis test service, not the user's LibreChat Redis.
const assert = require('node:assert/strict');
const Redis = require('ioredis');
const { RedisJobStore } = require('@librechat/api');

(async () => {
  const redis = new Redis({ host: '127.0.0.1', port: 6379, maxRetriesPerRequest: 1 });
  try {
    const store = new RedisJobStore(redis, { completedTtl: 300 });
    const stream = `b1-isolated-${process.pid}`;
    const provider = 'provider-original-b1-12345';
    const job = await store.createJob(stream, 'test-user', stream, 'test-tenant', {
      providerExecutionId: provider,
      checkpointNamespace: 'test-generation-b1',
      generationProtocolVersion: 2,
    });
    assert.equal(job.status, 'running');
    assert.equal(await store.beginProviderExecution(stream, job.createdAt, provider), true);
    await store.updateJob(stream, {
      orchestratorPlan: {
        tasks: [{ key: 'research', taskId: 'mission/research', nodeId: 'research', agentId: 'research', validation: [] }],
      },
    }, job.createdAt);
    const ownerToken = 'mission-b1-isolated-owner-12345';
    assert.equal(await store.claimDrainedMissionRecovery(
      stream, job.createdAt, Date.now() - 20_000, ownerToken, 15_000,
    ), false, 'live owner must not be claimed');
    console.log('BOTMODE_REAL_REDIS_LIVE_LEASE_DENIED=PASS');

    // Simulate *only* Redis-server lease expiry and its activity quarantine.
    // The source-built store must still enforce both using its production Lua.
    await redis.hset(`stream:{${stream}}:job`,
      'lastActiveAt', String(Date.now() - 45_000),
      '__missionProviderLeaseUntil', String(Date.now() - 1_000));
    assert.equal(await store.claimDrainedMissionRecovery(
      stream, job.createdAt, Date.now() - 20_000, ownerToken, 15_000,
    ), true, 'expired owner should admit inspection only');
    assert.equal(await store.transitionStatus(stream, {
      from: 'running', to: 'error', expectCreatedAt: job.createdAt,
      patch: { error: 'OUTCOME_UNKNOWN', completedAt: Date.now() },
    }), true);
    const settled = await store.getJob(stream);
    assert.equal(settled.status, 'error');
    assert.equal(settled.error, 'OUTCOME_UNKNOWN');
    assert.equal(settled.finalEvent, undefined, 'no P6 final frame may appear');
    assert.equal(await store.transitionStatus(stream, {
      from: 'running', to: 'error', expectCreatedAt: job.createdAt,
      patch: { error: 'OUTCOME_UNKNOWN' },
    }), false, 'second claimant must lose the CAS');
    assert.equal(await store.releaseDrainedMissionRecovery(stream, job.createdAt, ownerToken), true);
    assert.equal(await store.beginProviderExecution(stream, job.createdAt, provider), false);
    console.log('BOTMODE_REAL_REDIS_UNKNOWN_OUTCOME_SINGLE_CAS_NO_REPLAY=PASS');
  } finally {
    await redis.quit();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
