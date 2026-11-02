'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Execute the real server bootstrap function, not a copy of its decisions.
// No provider, Redis, Mongo, HTTP endpoint or Docker service is opened.
const server = fs.readFileSync('api/server/index.js', 'utf8');
const start = server.indexOf('const configureGenerationStreams = () => {');
const end = server.indexOf('\nconst startServer = async () => {', start);
assert.ok(start >= 0 && end > start, 'production generation bootstrap must exist');
const realBootstrap = server.slice(start, end);

for (const isRedis of [true, false]) {
  for (const recoverySetting of ['false', 'true']) {
    for (const auditSetting of ['false', 'true']) {
    const calls = { configured: 0, initialized: 0, shutdown: [] };
    const manager = {
      isRedis,
      configure: (cfg) => { calls.configured++; assert.equal(cfg.cleanupOnComplete, true); },
      setApprovalExpiredHandler: () => {},
      setPendingActionDurableHandler: () => {},
      setTerminalHostActionHandler: () => {},
      setNativeMissionRecoveryHandler: () => {
        throw new Error('UNSAFE_AUTO_REPLAY_REGISTERED');
      },
      initialize: () => { calls.initialized++; },
      prepareForShutdown: () => {},
      destroy: () => {},
    };
    const context = {
      GenerationJobManager: manager,
      process: { env: {
        BOTMODE_DISABLE_NATIVE_MISSION_RECOVERY: recoverySetting,
        BOTMODE_NATIVE_RECOVERY_READONLY_AUDIT: auditSetting,
        BOTMODE_NATIVE_RECOVERY_CLAIM_AUDIT: auditSetting,
      } },
      isEnabled: (value) => value === 'true',
      createStreamServices: () => ({ marker: 'stream-services' }),
      recordExpiredScheduleApproval: () => {},
      createSimpleXPendingActionNotifier: () => () => {},
      createAgentEventTerminalHandler: () => () => {},
      agentEventMethods: {},
      resumeAgentEventDetachedAction: () => {},
      registerShutdownTask: (name) => calls.shutdown.push(name),
    };
    vm.runInNewContext(realBootstrap + '\nconfigureGenerationStreams();', context, {
      timeout: 500,
    });
    assert.equal(calls.configured, 1);
    assert.equal(calls.initialized, 1);
    assert.deepEqual(calls.shutdown, [
      'generation job manager prepare', 'generation job manager',
    ]);
    }
  }
}
console.log('BOTMODE_NATIVE_NO_UNCERTAIN_PROVIDER_AUTO_REPLAY_BOOTSTRAP=PASS (8 configurations)');
