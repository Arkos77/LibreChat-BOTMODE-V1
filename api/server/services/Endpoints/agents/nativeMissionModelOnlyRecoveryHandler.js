const { ResourceType, PermissionBits } = require('librechat-data-provider');
const { checkPermission } = require('~/server/services/PermissionService');
const {
  createNativeMissionRecoveryHostAuthorization,
} = require('./nativeMissionRecoveryHostAuthorization');
const {
  createNativeMissionAuthorizedClientInitializer,
} = require('./nativeMissionAuthorizedClientInitializer');
const {
  createNativeMissionRecoveryHandlerFactory,
} = require('./nativeMissionRecoveryHandlerFactory');
const {
  createNativeMissionModelOnlyRecoveryCallbacks,
} = require('./nativeMissionModelOnlyRecoveryCallbacks');
const {
  createNativeMissionOriginalModelOnlyReplay,
} = require('./nativeMissionOriginalModelOnlyReplay');

/**
 * Production host assembly for the VERY NARROW, original-model-only subset.
 * No extra scheduler, agent, tool router, auth session or AI provider is made.
 *
 * All execution-capable dependencies come from the authenticated host and the
 * exact SDK already used for ordinary mission runs. There is no fallback when
 * a receipt/owner/ACL/Oracle/publication dependency is missing. Missions with
 * external tools, files, paid balance, delegation or unknown original tool
 * surface remain explicitly ineligible for cold automatic replay.
 */
function createNativeMissionModelOnlyRecoveryHandler({
  manager,
  getUserById,
  isSubagentOwnerAdmissible,
  getConvo,
  getAgent,
  initializeClientFromDocuments,
  createRun,
  validateMissionTask,
  normalizeMissionOracleState,
  areMissionOracleResultsEquivalent,
  qualifyAndExecuteRecoveredMissionSegment,
  continueColdNativeMissionGraph,
  getMessage,
  saveMessage,
  sanitizeMessage,
  emitDone,
  permission = checkPermission,
  log,
}) {
  if (
    typeof manager?.getJobStore !== 'function' ||
    [
      getUserById,
      isSubagentOwnerAdmissible,
      getConvo,
      getAgent,
      initializeClientFromDocuments,
      createRun,
      validateMissionTask,
      normalizeMissionOracleState,
      areMissionOracleResultsEquivalent,
      qualifyAndExecuteRecoveredMissionSegment,
      continueColdNativeMissionGraph,
      getMessage,
      saveMessage,
      sanitizeMessage,
      emitDone,
      permission,
    ].some((callback) => typeof callback !== 'function') ||
    typeof log?.warn !== 'function'
  ) {
    throw new Error('NATIVE_MISSION_MODEL_ONLY_RECOVERY_HOST_INCOMPLETE');
  }

  const authorizationDeps = {
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
  };
  const authorizeCandidate = createNativeMissionRecoveryHostAuthorization({
    getUserById,
    isSubagentOwnerAdmissible,
    getConvo,
    getAgent,
    permission,
    resourceType: ResourceType.AGENT,
    viewPermission: PermissionBits.VIEW,
  });
  const initializeDocuments = createNativeMissionAuthorizedClientInitializer({
    manager,
    authorizationDeps,
    initializeClientFromDocuments,
  });
  const replay = createNativeMissionOriginalModelOnlyReplay({ manager });
  const initializeAuthorizedClient = async (coordinates) => {
    const initialized = await initializeDocuments(coordinates);
    if (!initialized.client?.options) {
      throw new Error('NATIVE_MISSION_MODEL_ONLY_CLIENT_OPTIONS_UNAVAILABLE');
    }
    // The SDK cold graph builder invokes this before graph creation and
    // BEFORE the manager promotes a Redis claim. Install the genuine
    // original capability + empty-effect-receipt proof, not an always-true
    // test callback or a reconstructed no-tool guess.
    initialized.client.options.nativeMissionReplayReceiptProof = (ids) =>
      replay.proveNoOriginalEffects({
        client: initialized.client,
        assertAuthorized: coordinates.assertAuthorized,
        ...ids,
      });
    return initialized;
  };
  const callbacks = createNativeMissionModelOnlyRecoveryCallbacks({
    manager,
    validateMissionTask,
    normalizeOracleState: normalizeMissionOracleState,
    areMissionOracleResultsEquivalent,
    getConversation: getConvo,
    getMessage,
    saveMessage,
    sanitizeMessage,
    emitDone,
  });
  return createNativeMissionRecoveryHandlerFactory({
    manager,
    authorizeCandidate,
    initializeAuthorizedClient,
    normalizeOracleState: normalizeMissionOracleState,
    createRun,
    replaySafety: replay.replaySafety,
    effectFences: replay.effectFences,
    oracle: callbacks.oracle,
    publication: callbacks.publication,
    qualifyAndExecuteRecoveredMissionSegment,
    continueColdNativeMissionGraph,
    log,
  });
}

module.exports = { createNativeMissionModelOnlyRecoveryHandler };
