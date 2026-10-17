const { createNativeMissionColdGraphBuilder } = require('./nativeMissionColdGraphBuilder');
const { bindNativeMissionRecoveredClient } = require('./nativeMissionRecoveredClientBinding');

/** Construct the coordinator's cold runtime solely from a host-initialized client.
 * The supplied initializer must do the real request-independent credential,
 * agent, tool, model and permission reconstruction. No HTTP session or
 * synthetic req.user is ever generated in this module.
 *
 * Important: this factory is NOT a production initializer by itself. Missing
 * tool replay receipts or publication recovery callbacks are a hard refusal.
 */
function createNativeMissionColdRuntimeHost({
  initializeAuthorizedClient,
  normalizeOracleState,
  reconstructGraph,
  createRun,
  replaySafety,
  effectFences,
  oracle,
  publication,
}) {
  const buildGraph =
    reconstructGraph ??
    (typeof createRun === 'function'
      ? createNativeMissionColdGraphBuilder({ createRun })
      : undefined);
  if (
    [
      initializeAuthorizedClient,
      normalizeOracleState,
      buildGraph,
      replaySafety,
      effectFences,
      oracle,
      publication,
    ].some((part) => typeof part !== 'function')
  ) {
    throw new Error('NATIVE_COLD_RUNTIME_HOST_DEPENDENCIES_MISSING');
  }
  return async ({ candidate, claim, assertAuthorized }) => {
    if (
      !candidate ||
      !claim ||
      typeof assertAuthorized !== 'function' ||
      claim.streamId !== candidate.streamId ||
      claim.createdAt !== candidate.createdAt ||
      claim.checkpointNamespace !== candidate.checkpointNamespace ||
      claim.checkpointId !== candidate.checkpointId
    ) {
      throw new Error('NATIVE_COLD_RUNTIME_HOST_CLAIM_MISMATCH');
    }
    await assertAuthorized();
    const initialized = await initializeAuthorizedClient({ candidate, claim, assertAuthorized });
    if (
      !initialized ||
      !initialized.client ||
      !initialized.job ||
      initialized.job.streamId !== candidate.streamId ||
      initialized.job.createdAt !== candidate.createdAt
    ) {
      throw new Error('NATIVE_COLD_RUNTIME_HOST_INITIALIZATION_DENIED');
    }
    const client = bindNativeMissionRecoveredClient({
      client: initialized.client,
      candidate,
      job: initialized.job,
      normalizeOracleState,
    });
    await assertAuthorized();
    const graph = await buildGraph({ client, candidate, claim, assertAuthorized });
    if (!graph || typeof graph.invoke !== 'function' || typeof graph.getState !== 'function') {
      throw new Error('NATIVE_COLD_RUNTIME_HOST_GRAPH_UNAVAILABLE');
    }
    const context = Object.freeze({ client, graph, candidate, claim });
    const fences = await effectFences(context);
    const replay = await replaySafety(context);
    const verdict = await oracle(context);
    const publish = await publication(context);
    if (
      typeof fences !== 'function' ||
      typeof replay !== 'function' ||
      typeof verdict !== 'function' ||
      !publish ||
      typeof publish.getCandidate !== 'function' ||
      typeof publish.publishTerminal !== 'function'
    ) {
      throw new Error('NATIVE_COLD_RUNTIME_HOST_CAPABILITIES_MISSING');
    }
    await assertAuthorized();
    await fences();
    return {
      graph,
      assertReplaySafe: replay,
      assertEffectFencesReady: fences,
      verifyOracle: verdict,
      getPublicationCandidate: publish.getCandidate,
      publishTerminal: publish.publishTerminal,
    };
  };
}
module.exports = { createNativeMissionColdRuntimeHost };
