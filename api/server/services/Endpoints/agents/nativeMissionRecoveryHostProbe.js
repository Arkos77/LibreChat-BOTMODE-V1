const { logger } = require('@librechat/data-schemas');
const { ResourceType, PermissionBits } = require('librechat-data-provider');
const { checkPermission } = require('~/server/services/PermissionService');
const { authorizeNativeMissionRecovery } = require('./nativeMissionRecoveryAuthorization');

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
    const job = await manager.getJob(candidate.streamId);
    const admission = await authorizeNativeMissionRecovery({
      candidate,
      job,
      deps: {
        getUserById,
        isOwnerAdmissible: isSubagentOwnerAdmissible,
        getConvo,
        getAgent,
        canViewAgent: ({ user, agent }) =>
          permission({
            userId: String(user._id ?? user.id),
            role: user.role,
            resourceType: ResourceType.AGENT,
            resourceId: agent._id,
            requiredPermission: PermissionBits.VIEW,
          }),
      },
    });
    const key = candidate.streamId + ':' + candidate.createdAt;
    if (!observed.has(key)) {
      observed.add(key);
      log.info('[NativeMissionRecovery] Host read-only authority preflight', {
        // Deliberately no user ID, token, agent identity or content in diagnostics.
        status: admission == null ? 'DENIED' : 'AUTHORIZED_READ_ONLY',
        checkpointPresent: !!candidate.checkpointId,
      });
    }
    // No claim, no execution and no proof of side-effect replay safety.
    return admission != null;
  };
}

module.exports = { createNativeMissionRecoveryHostProbe };
