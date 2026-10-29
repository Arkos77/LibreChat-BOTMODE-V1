'use strict';
const assert = require('node:assert/strict');
const Module = require('node:module');
const realLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  // The negative assembly proof must not render a candidate. This CI job
  // deliberately has no built @librechat/api workspace dependency.
  if (
    request === '@librechat/api' &&
    parent?.filename?.endsWith('/nativeMissionModelOnlyRecoveryCallbacks.js')
  ) {
    return {
      renderMissionPublication: async () => {
        throw Error('unexpected publication from denied recovery assembly');
      },
    };
  }
  if (request === 'librechat-data-provider') {
    return { ResourceType: { AGENT: 'agent' }, PermissionBits: { VIEW: 1 } };
  }
  if (request === '~/server/services/PermissionService') {
    return { checkPermission: async () => true };
  }
  return realLoad.call(this, request, parent, isMain);
};
const {
  createNativeMissionModelOnlyRecoveryHandler,
} = require('../../api/server/services/Endpoints/agents/nativeMissionModelOnlyRecoveryHandler');
Module._load = realLoad;

(async () => {
  const manager = {
    getJobStore: () => ({
      getJob: async () => null,
      releaseDrainedMissionRecovery: async () => false,
      renewDrainedMissionRecovery: async () => false,
      readNativeMissionEffect: async () => {
        throw Error('no original proof');
      },
    }),
    claimCheckpointedOrphanForInspection: async () => {
      throw Error('claim must NOT be taken on unadmitted original job');
    },
  };
  let modelCalls = 0;
  const f = async () => {};
  const deps = {
    manager,
    getUserById: f,
    isSubagentOwnerAdmissible: f,
    getConvo: f,
    getAgent: f,
    initializeClientFromDocuments: f,
    createRun: async () => {
      modelCalls++;
    },
    validateMissionTask: f,
    normalizeMissionOracleState: () => ({}),
    areMissionOracleResultsEquivalent: () => false,
    qualifyAndExecuteRecoveredMissionSegment: f,
    continueColdNativeMissionGraph: f,
    getMessage: f,
    saveMessage: f,
    sanitizeMessage: (message) => message,
    emitDone: f,
    log: { warn: () => {} },
  };
  assert.throws(
    () =>
      createNativeMissionModelOnlyRecoveryHandler({
        ...deps,
        initializeClientFromDocuments: undefined,
      }),
    /HOST_INCOMPLETE/,
  );
  const handler = createNativeMissionModelOnlyRecoveryHandler(deps);
  assert.equal(typeof handler, 'function');
  const candidate = {
    streamId: 'conv',
    createdAt: 1700000000000,
    checkpointNamespace: 'epoch',
    checkpointId: 'head',
  };
  await assert.rejects(handler(candidate), /HOST_AUTHORITY_DENIED/);
  assert.equal(modelCalls, 0);
  console.log('BOTMODE_PRODUCTION_RECOVERY_ASSEMBLY_FAILS_CLOSED=PASS');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
