/** Read-only, fail-closed validation of every expected durable tool effect.
 * Expected operation identities must come from the authenticated checkpoint,
 * never from the mutable provider response or the current tool call order.
 * A committed Redis receipt is not sufficient by itself: the private result
 * reference must also be authenticated and digest-verified by the host.
 */
function createNativeMissionReplayReceiptProof({
  store,
  resolveExpectedEffects,
  verifyPrivateResult,
  assertAuthorized,
}) {
  if (
    typeof store?.readNativeMissionEffect !== 'function' ||
    typeof resolveExpectedEffects !== 'function' ||
    typeof verifyPrivateResult !== 'function' ||
    typeof assertAuthorized !== 'function'
  ) {
    throw new Error('NATIVE_MISSION_REPLAY_PROOF_DEPENDENCIES_MISSING');
  }
  return async ({ candidate, claim }) => {
    if (
      !candidate ||
      !claim ||
      candidate.streamId !== claim.streamId ||
      candidate.createdAt !== claim.createdAt ||
      candidate.checkpointNamespace !== claim.checkpointNamespace ||
      candidate.checkpointId !== claim.checkpointId ||
      typeof claim.ownerToken !== 'string' ||
      !claim.ownerToken
    ) {
      throw new Error('NATIVE_MISSION_REPLAY_PROOF_IDENTITY_DENIED');
    }
    await assertAuthorized();
    const effects = await resolveExpectedEffects({ candidate, claim });
    if (!Array.isArray(effects) || effects.length > 256) {
      throw new Error('NATIVE_MISSION_REPLAY_PROOF_EFFECT_SET_UNAVAILABLE');
    }
    const seen = new Set();
    for (const effect of effects) {
      const id = effect?.identity;
      if (
        !id ||
        id.streamId !== candidate.streamId ||
        id.createdAt !== candidate.createdAt ||
        id.checkpointNamespace !== candidate.checkpointNamespace ||
        typeof id.providerExecutionId !== 'string' ||
        !id.providerExecutionId ||
        typeof id.operationKey !== 'string' ||
        !/^[a-f0-9]{64}$/.test(id.operationKey) ||
        typeof id.argumentsDigest !== 'string' ||
        !/^[a-f0-9]{64}$/.test(id.argumentsDigest) ||
        seen.has(id.operationKey)
      ) {
        throw new Error('NATIVE_MISSION_REPLAY_PROOF_EFFECT_IDENTITY_DENIED');
      }
      seen.add(id.operationKey);
      await assertAuthorized();
      const receipt = await store.readNativeMissionEffect(id);
      if (
        receipt?.accepted !== true ||
        receipt.reason !== 'committed' ||
        typeof receipt.resultRef !== 'string' ||
        !receipt.resultRef ||
        typeof receipt.resultDigest !== 'string' ||
        !/^[a-f0-9]{64}$/.test(receipt.resultDigest)
      ) {
        throw new Error('NATIVE_MISSION_REPLAY_PROOF_EFFECT_UNCERTAIN');
      }
      await assertAuthorized();
      if (
        (await verifyPrivateResult({
          identity: id,
          ref: receipt.resultRef,
          digest: receipt.resultDigest,
        })) !== true
      ) {
        throw new Error('NATIVE_MISSION_REPLAY_PROOF_PRIVATE_RESULT_INVALID');
      }
      await assertAuthorized();
    }
    // An empty set only attests there are no checkpoint-declared completed
    // effects. A separate fence for ALL future effect paths remains mandatory.
    await assertAuthorized();
    return true;
  };
}
module.exports = { createNativeMissionReplayReceiptProof };
