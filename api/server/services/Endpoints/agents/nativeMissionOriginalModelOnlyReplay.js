const {
  assertNativeMissionCapabilityAttestation,
} = require('./nativeMissionCapabilityAttestation');
const { createNativeMissionReplayReceiptProof } = require('./nativeMissionReplayReceiptProof');

/**
 * Original, effect-free mission provenance. This is intentionally limited to
 * executions whose COMPLETE original initialized tool surface was model-only.
 * A zero-length receipt inventory is then warranted by the original capability
 * snapshot, NOT inferred from missing post-crash data or a stripped tool list.
 *
 * This gate does not register a provider and does not waive the separate
 * graph-head qualification, Redis CAS, user ACL or Oracle/publication barriers.
 */
function createNativeMissionOriginalModelOnlyReplay({ manager }) {
  if (typeof manager?.getJobStore !== 'function') {
    throw new Error('NATIVE_MODEL_ONLY_REPLAY_STORE_UNAVAILABLE');
  }

  const proveOriginalSurface = async ({ client, candidate, claim, assertAuthorized }) => {
    if (
      !client ||
      !candidate ||
      !claim ||
      claim.streamId !== candidate.streamId ||
      claim.createdAt !== candidate.createdAt ||
      claim.checkpointNamespace !== candidate.checkpointNamespace ||
      claim.checkpointId !== candidate.checkpointId ||
      !claim.ownerToken ||
      typeof assertAuthorized !== 'function' ||
      typeof client.getReachableMissionAgents !== 'function'
    ) {
      throw new Error('NATIVE_MODEL_ONLY_REPLAY_IDENTITY_DENIED');
    }
    await assertAuthorized();
    const store = manager.getJobStore();
    if (
      typeof store?.getJob !== 'function' ||
      typeof store?.readNativeMissionEffect !== 'function'
    ) {
      throw new Error('NATIVE_MODEL_ONLY_REPLAY_RECEIPTS_UNAVAILABLE');
    }
    const job = await store.getJob(candidate.streamId);
    if (
      job?.createdAt !== candidate.createdAt ||
      job?.streamId !== candidate.streamId ||
      job?.checkpointNamespace !== candidate.checkpointNamespace ||
      job?.pendingAction != null ||
      (job?.status !== 'running' &&
        !(job?.status === 'complete' && job?.terminalPersistencePending === true)) ||
      !job?.orchestratorPlan?.tasks?.length ||
      JSON.stringify(job.orchestratorPlan) !== JSON.stringify(client.orchestratorPlan) ||
      client.options?.agent?.id !== job.agent_id ||
      client.conversationId !== candidate.streamId ||
      client.jobCreatedAt !== candidate.createdAt ||
      client.checkpointNamespace !== candidate.checkpointNamespace ||
      client.options?.subagentTasks != null
    ) {
      throw new Error('NATIVE_MODEL_ONLY_REPLAY_JOB_CHANGED');
    }
    const attestation = assertNativeMissionCapabilityAttestation({
      recorded: job.nativeMissionCapabilityAttestation,
      plan: job.orchestratorPlan,
      agents: client.getReachableMissionAgents(),
      subagentTasks: client.options.subagentTasks,
    });
    if (attestation.mode !== 'model_only' || attestation.hostEffectPathsPresent) {
      throw new Error('NATIVE_MODEL_ONLY_REPLAY_EFFECT_RECEIPTS_REQUIRED');
    }
    await assertAuthorized();
    if (manager.getJobStore() !== store) {
      throw new Error('NATIVE_MODEL_ONLY_REPLAY_STORE_CHANGED');
    }
    return { store, job };
  };

  const proveNoOriginalEffects = async ({ client, candidate, claim, assertAuthorized }) => {
    const { store } = await proveOriginalSurface({ client, candidate, claim, assertAuthorized });
    const proof = createNativeMissionReplayReceiptProof({
      store,
      assertAuthorized,
      resolveExpectedEffects: async () => {
        // A complete original zero-effect inventory is derivable ONLY from
        // the original immutable model-only admission proof, rechecked under
        // the current authorization closure and exact owner generation.
        await proveOriginalSurface({ client, candidate, claim, assertAuthorized });
        return { ...candidate, complete: true, effects: [] };
      },
      verifyPrivateResult: async () => false, // Unexpected effect: never authenticated.
    });
    return proof({ candidate, claim });
  };

  const replaySafety =
    async ({ client, candidate, claim, assertAuthorized }) =>
    async (pendingNodes) => {
      const plan = client.orchestratorPlan;
      const allowed = new Set((plan?.tasks ?? []).map((task) => task.nodeId));
      if (
        !Array.isArray(pendingNodes) ||
        pendingNodes.length === 0 ||
        pendingNodes.some((name) => typeof name !== 'string' || !allowed.has(name)) ||
        new Set(pendingNodes).size !== pendingNodes.length
      ) {
        throw new Error('NATIVE_MODEL_ONLY_REPLAY_PENDING_NODES_DENIED');
      }
      return proveNoOriginalEffects({ client, candidate, claim, assertAuthorized });
    };

  const effectFences =
    async ({ client, candidate, claim, assertAuthorized }) =>
    async () => {
      // The SDK cold-graph continuation separately forces
      // nativeMissionEffectFenceRequired:true for EVERY node/tool path.
      // No missing approval or private effect receipt is assumed safe here.
      return proveNoOriginalEffects({ client, candidate, claim, assertAuthorized });
    };

  return { proveNoOriginalEffects, replaySafety, effectFences };
}

module.exports = { createNativeMissionOriginalModelOnlyReplay };
