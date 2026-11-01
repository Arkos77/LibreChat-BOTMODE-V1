'use strict';

/**
 * Read-only proof for an original native graph model operation after API crash.
 * This is NOT permission to resume a graph or replay any other effect.
 * Caller must separately prove ACL, original checkpoint and live Redis owner.
 */
function createNativeMissionColdGraphReceiptProof({ store, assertAuthorized }) {
  if (typeof store?.readOriginalNativeGraph !== 'function' ||
      typeof assertAuthorized !== 'function') {
    throw new Error('NATIVE_COLD_GRAPH_RECEIPT_DEPENDENCIES_MISSING');
  }
  return async ({ candidate, claim, identity, requestDigest, pendingNodes }) => {
    if (!candidate || !claim || !identity ||
        candidate.streamId !== claim.streamId ||
        candidate.createdAt !== claim.createdAt ||
        candidate.checkpointNamespace !== claim.checkpointNamespace ||
        candidate.checkpointId !== claim.checkpointId ||
        typeof claim.ownerToken !== 'string' || claim.ownerToken.length < 16 ||
        identity.mode !== 'native_graph' ||
        identity.streamId !== candidate.streamId ||
        identity.generationCreatedAt !== candidate.createdAt ||
        identity.checkpointNamespace !== candidate.checkpointNamespace ||
        identity.graphCheckpointId !== candidate.checkpointId ||
        ['userId', 'streamId', 'responseMessageId', 'checkpointNamespace',
          'nodeId', 'taskId', 'agentId', 'provider', 'model'].some(
          (key) => typeof identity[key] !== 'string' ||
            identity[key].length === 0 || identity[key].length > 256) ||
        typeof identity.tenantId !== 'string' || identity.tenantId.length > 256 ||
        !Array.isArray(pendingNodes) || pendingNodes.length !== 1 ||
        pendingNodes[0] !== identity.nodeId ||
        typeof requestDigest !== 'string' ||
        !/^[a-f0-9]{64}$/.test(requestDigest) ||
        Object.prototype.hasOwnProperty.call(identity, 'operationKey')) {
      throw new Error('NATIVE_COLD_GRAPH_RECEIPT_IDENTITY_DENIED');
    }
    await assertAuthorized();
    const receipt = await store.readOriginalNativeGraph({ identity, requestDigest });
    await assertAuthorized();
    if (receipt?.status !== 'result_committed' ||
        receipt.resultAvailable !== true ||
        !Array.isArray(receipt.response?.choices) ||
        receipt.response.choices.length !== 1) {
      throw new Error('NATIVE_COLD_GRAPH_RECEIPT_UNAVAILABLE');
    }
    return Object.freeze({ identity: Object.freeze({ ...identity }), requestDigest });
  };
}

module.exports = { createNativeMissionColdGraphReceiptProof };
