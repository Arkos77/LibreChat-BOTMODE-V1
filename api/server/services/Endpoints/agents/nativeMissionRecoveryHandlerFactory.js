const { createNativeMissionRecoveryCoordinator } = require('./nativeMissionRecoveryCoordinator');
const { createNativeMissionColdRuntimeHost } = require('./nativeMissionColdRuntimeHost');

/** Assemble the EXISTING SDK recovery executor and cold graph continuation
 * with the authenticated host. All capabilities are mandatory. This factory
 * never registers a recovery handler: registration must only happen after
 * the real server provides durable effect and publication implementations.
 */
function createNativeMissionRecoveryHandlerFactory({
  manager,
  authorizeCandidate,
  initializeAuthorizedClient,
  normalizeOracleState,
  createRun,
  replaySafety,
  effectFences,
  oracle,
  publication,
  qualifyAndExecuteRecoveredMissionSegment,
  continueColdNativeMissionGraph,
  log,
}) {
  if (
    typeof qualifyAndExecuteRecoveredMissionSegment !== 'function' ||
    typeof continueColdNativeMissionGraph !== 'function'
  ) {
    throw new Error('NATIVE_MISSION_RECOVERY_SDK_RUNTIME_UNAVAILABLE');
  }
  const reconstruct = createNativeMissionColdRuntimeHost({
    initializeAuthorizedClient,
    normalizeOracleState,
    createRun,
    replaySafety,
    effectFences,
    oracle,
    publication,
  });
  return createNativeMissionRecoveryCoordinator({
    manager,
    authorizeCandidate,
    reconstruct,
    execute: qualifyAndExecuteRecoveredMissionSegment,
    continueColdGraph: continueColdNativeMissionGraph,
    log,
  });
}

module.exports = { createNativeMissionRecoveryHandlerFactory };
