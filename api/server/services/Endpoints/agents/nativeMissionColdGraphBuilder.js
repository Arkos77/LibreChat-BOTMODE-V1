/** Reconstruct only the SDK graph of an existing, authenticated mission.
 * The provider-specific model/tool/session wiring must be built by the real
 * host and passed through createRunOptions. This adapter NEVER starts a turn,
 * supplies messages, resumes a HITL command or runs a tool.
 */
function createNativeMissionColdGraphBuilder({ createRun }) {
  if (typeof createRun !== 'function') {
    throw new Error('NATIVE_COLD_GRAPH_BUILDER_UNAVAILABLE');
  }
  return async ({ client, candidate, claim, assertAuthorized }) => {
    if (
      !client ||
      !candidate ||
      !claim ||
      typeof assertAuthorized !== 'function' ||
      client.conversationId !== candidate.streamId ||
      client.jobCreatedAt !== candidate.createdAt ||
      client.checkpointNamespace !== candidate.checkpointNamespace ||
      claim.checkpointId !== candidate.checkpointId ||
      claim.ownerToken == null ||
      client.orchestratorPlan == null ||
      typeof client.createNativeMissionColdRunOptions !== 'function'
    ) {
      throw new Error('NATIVE_COLD_GRAPH_HOST_OPTIONS_MISSING');
    }
    await assertAuthorized();
    // A host callback is mandatory: redis data alone is insufficient to
    // reconstruct provider credentials, model budget guards and tool contexts.
    const options = await client.createNativeMissionColdRunOptions({ candidate, claim });
    if (
      !options ||
      !Array.isArray(options.agents) ||
      !options.agents.length ||
      options.orchestratorPlan !== client.orchestratorPlan ||
      options.conversationId !== candidate.streamId ||
      options.runId !== client.responseMessageId ||
      options.messages?.length !== 0 ||
      options.hitlCapable === true ||
      !options.signal ||
      !options.appConfig ||
      !options.user ||
      !Array.isArray(options.modelCallbacks) ||
      !options.modelCallbacks.length ||
      typeof options.resolveMissionOracleEvidence !== 'function' ||
      typeof options.persistMissionOracleResult !== 'function' ||
      !options.requestBody ||
      !options.toolExecution ||
      typeof options.assertNativeMissionReplayFences !== 'function'
    ) {
      throw new Error('NATIVE_COLD_GRAPH_REPLAY_PROOFS_MISSING');
    }
    await assertAuthorized();
    // The check must execute against the original durable claim. A truthy
    // feature flag cannot attest tool-effect receipts or Redis ownership.
    const proof = await options.assertNativeMissionReplayFences({ candidate, claim });
    if (proof !== true) {
      throw new Error('NATIVE_COLD_GRAPH_REPLAY_PROOFS_MISSING');
    }
    await assertAuthorized();
    const { assertNativeMissionReplayFences: _proof, ...safeOptions } = options;
    const run = await createRun({ ...safeOptions, messages: [], hitlCapable: false });
    const graph = run?.Graph?.createWorkflow?.();
    if (!graph || typeof graph.getState !== 'function' || typeof graph.invoke !== 'function') {
      throw new Error('NATIVE_COLD_GRAPH_RECONSTRUCTION_FAILED');
    }
    await assertAuthorized();
    return graph;
  };
}
module.exports = { createNativeMissionColdGraphBuilder };
