const { authorizeNativeMissionRecovery } = require('./nativeMissionRecoveryAuthorization');

/** Adapt current host identity, owner policy and agent VIEW permission to the
 * coordinator's boolean admission contract. Never trust job-supplied grants.
 * This only authorizes reconstruction; no claim, tool or publication is made.
 */
function createNativeMissionRecoveryHostAuthorization({
  getUserById,
  isSubagentOwnerAdmissible,
  getConvo,
  getAgent,
  permission,
  resourceType,
  viewPermission,
  reportRejection,
}) {
  if (
    [getUserById, isSubagentOwnerAdmissible, getConvo, getAgent, permission].some(
      (value) => typeof value !== 'function',
    ) ||
    resourceType == null ||
    viewPermission == null
  ) {
    throw new Error('NATIVE_RECOVERY_HOST_AUTH_DEPENDENCIES_MISSING');
  }
  return async ({ candidate, job }) => {
    const admission = await authorizeNativeMissionRecovery({
      candidate,
      job,
      reportRejection,
      deps: {
        getUserById,
        isOwnerAdmissible: isSubagentOwnerAdmissible,
        getConvo,
        getAgent,
        canViewAgent: ({ user, agent }) =>
          permission({
            userId: String(user._id ?? user.id),
            role: user.role,
            resourceType,
            resourceId: agent._id,
            requiredPermission: viewPermission,
          }),
      },
    });
    return admission != null;
  };
}

module.exports = { createNativeMissionRecoveryHostAuthorization };
