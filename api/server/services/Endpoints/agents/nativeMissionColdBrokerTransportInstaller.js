'use strict';
const { createNativeMissionRecoveredGraphCheckpointReader } =
  require('./nativeMissionRecoveredGraphCheckpointReader');
const { canonicalMissionJson } = require('./nativeMissionWakeupOriginStore');

/** Install only the original read-only broker transport, before SDK graph build. */
function createNativeMissionColdBrokerTransportInstaller({ brokerHost, getOriginal }) {
  if (typeof brokerHost?.makeRecoveryFetchFactoryWithReader !== 'function' ||
      typeof getOriginal !== 'function') {
    throw new Error('NATIVE_COLD_BROKER_INSTALLER_DEPENDENCIES_MISSING');
  }
  return async ({ client, job, candidate, claim, assertAuthorized }) => {
    if (!client?.options || client.options.nativeGraphModelFetchFactory != null ||
        !job || !candidate || !claim ||
        typeof assertAuthorized !== 'function' ||
        client.conversationId !== candidate.streamId ||
        job.streamId !== candidate.streamId || job.createdAt !== candidate.createdAt ||
        job.checkpointNamespace !== candidate.checkpointNamespace ||
        claim.streamId !== candidate.streamId ||
        claim.createdAt !== candidate.createdAt ||
        claim.checkpointNamespace !== candidate.checkpointNamespace ||
        claim.checkpointId !== candidate.checkpointId ||
        typeof claim.ownerToken !== 'string' || claim.ownerToken.length < 16 ||
        client.orchestratorPlan !== job.orchestratorPlan) {
      throw new Error('NATIVE_COLD_BROKER_INSTALLER_IDENTITY_DENIED');
    }
    await assertAuthorized();
    const original = await getOriginal({
      userId: job.userId, tenantId: job.tenantId ?? '',
      conversationId: job.streamId,
      parentResponseMessageId: job.responseMessageId,
      agentId: job.agent_id,
    });
    await assertAuthorized();
    if (!original || original.userId !== job.userId ||
        original.tenantId !== (job.tenantId ?? '') ||
        original.conversationId !== candidate.streamId ||
        original.parentResponseMessageId !== job.responseMessageId ||
        original.originalCreatedAt !== candidate.createdAt ||
        original.checkpointNamespace !== candidate.checkpointNamespace ||
        original.agentId !== job.agent_id ||
        original.planId !== job.orchestratorPlan.planId ||
        String(client.user ?? '') !== job.userId ||
        client.responseMessageId !== job.responseMessageId ||
        client.jobCreatedAt !== candidate.createdAt ||
        client.checkpointNamespace !== candidate.checkpointNamespace ||
        original.capabilityAttestation?.mode !== 'receipts_required' ||
        canonicalMissionJson(original.plan) !== canonicalMissionJson(job.orchestratorPlan) ||
        canonicalMissionJson(original.capabilityAttestation) !==
          canonicalMissionJson(job.nativeMissionCapabilityAttestation)) {
      throw new Error('NATIVE_COLD_BROKER_ORIGINAL_MISMATCH');
    }
    let graph;
    const context = { client, candidate, claim, assertAuthorized,
      get graph() { return graph; } };
    const reader = createNativeMissionRecoveredGraphCheckpointReader({
      getRecoveryContext: () => context,
    });
    const factory = brokerHost.makeRecoveryFetchFactoryWithReader({
      original, plan: job.orchestratorPlan,
      capabilityAttestation: job.nativeMissionCapabilityAttestation, client,
    }, reader);
    if (typeof factory !== 'function') {
      throw new Error('NATIVE_COLD_BROKER_FACTORY_INVALID');
    }
    client.options.nativeGraphModelFetchFactory = factory;
    client.options.nativeMissionRecoveryRequiresReceipts = true;
    return Object.freeze({ bindGraph: async (reconstructed) => {
      await assertAuthorized();
      if (graph || typeof reconstructed?.getState !== 'function' ||
          typeof reconstructed?.invoke !== 'function') {
        throw new Error('NATIVE_COLD_BROKER_GRAPH_BINDING_DENIED');
      }
      graph = reconstructed;
      await assertAuthorized();
      return true;
    } });
  };
}
module.exports = { createNativeMissionColdBrokerTransportInstaller };
