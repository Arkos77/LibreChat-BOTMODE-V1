const { logger } = require('@librechat/data-schemas');
const { ResourceType, PermissionBits } = require('librechat-data-provider');
const { checkPermission } = require('~/server/services/PermissionService');
const {
  createNativeMissionRecoveryHostAuthorization,
} = require('./nativeMissionRecoveryHostAuthorization');

/**
 * CI diagnostic of recovered-job host identity, not a recovery executor.
 * It never takes a Redis claim, refreshes leases, opens a provider or publishes.
 * In production this handler is deliberately NOT registered.
 */
function createNativeMissionRecoveryHostProbe({
  manager,
  getUserById,
  isSubagentOwnerAdmissible,
  getConvo,
  getAgent,
  log = logger,
  permission = checkPermission,
}) {
  const observed = new Set();
  return async (candidate) => {
    // Read raw Redis fields: the facade's runtime-scoped `metadata` shape
    // is different, and getJob() would materialize a local abort/runtime.
    const job = await manager.getJobStore().getJob(candidate.streamId);
    let deniedAt = null;
    const authorized = await createNativeMissionRecoveryHostAuthorization({
      getUserById,
      isSubagentOwnerAdmissible,
      getConvo,
      getAgent,
      permission,
      resourceType: ResourceType.AGENT,
      viewPermission: PermissionBits.VIEW,
      reportRejection: (gate) => {
        deniedAt = gate;
      },
    })({ candidate, job });
    const key = candidate.streamId + ':' + candidate.createdAt;
    if (!observed.has(key)) {
      observed.add(key);
      // Stable diagnostics survive logger formatting that drops the metadata
      // object; only a non-sensitive, allow-listed decision code is included.
      log.info(
        '[NativeMissionRecovery] Host read-only authority preflight ' +
          JSON.stringify({
            status: !authorized ? 'DENIED' : 'AUTHORIZED_READ_ONLY',
            gate: !authorized ? (deniedAt ?? 'unknown') : 'passed',
            checkpointPresent: !!candidate.checkpointId,
          }),
      );
    }
    // No claim, no execution and no proof of side-effect replay safety.
    return authorized;
  };
}

module.exports = { createNativeMissionRecoveryHostProbe };
