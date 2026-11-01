'use strict';

const { createNativeMissionColdGraphReceiptProof } = require('./nativeMissionColdGraphReceiptProof');
const candidate = { streamId: 'parent', createdAt: 1700000000000,
  checkpointNamespace: 'gen', checkpointId: 'checkpoint-1' };
const claim = { ...candidate, ownerToken: 'original-owner-token-1234' };
const identity = { mode: 'native_graph', userId: 'owner', tenantId: 'tenant',
  streamId: 'parent', responseMessageId: 'original-response',
  taskId: 'analysis-task', agentId: 'analysis-agent', provider: 'openrouter',
  model: 'ci-free',
  generationCreatedAt: candidate.createdAt, checkpointNamespace: 'gen',
  graphCheckpointId: 'checkpoint-1', nodeId: 'analysis' };
const requestDigest = 'a'.repeat(64);
const pendingNodes = ['analysis'];
const success = { status: 'result_committed', resultAvailable: true,
  response: { choices: [{ message: { role: 'assistant', content: 'result' } }] } };
function setup(receipt = success) {
  const store = { readOriginalNativeGraph: jest.fn().mockResolvedValue(receipt) };
  const intentStore = { readOriginalIntent: jest.fn().mockResolvedValue({
    requestDigest, checkpointProof: { threadId: candidate.streamId,
      checkpointNamespace: candidate.checkpointNamespace, checkpointId: candidate.checkpointId,
      pendingNodes: ['analysis'] },
  }) };
  const assertAuthorized = jest.fn().mockResolvedValue(undefined);
  const prove = createNativeMissionColdGraphReceiptProof({ store, intentStore, assertAuthorized });
  return { prove, store, intentStore, assertAuthorized };
}
describe('cold native graph original receipt proof (read-only)', () => {
  it('accepts an authenticated committed original result without dispatch', async () => {
    const h = setup();
    await expect(h.prove({ candidate, claim, identity, requestDigest, pendingNodes }))
      .resolves.toMatchObject({ identity, requestDigest });
    expect(h.store.readOriginalNativeGraph).toHaveBeenCalledTimes(1);
    expect(h.assertAuthorized).toHaveBeenCalledTimes(3);
    expect(h.intentStore.readOriginalIntent).toHaveBeenCalledTimes(1);
  });
  it.each([
    { identity: { ...identity, graphCheckpointId: 'different' } },
    { identity: { ...identity, nodeId: 'research' } },
    { identity: { ...identity, taskId: '' } },
    { identity: { ...identity, provider: '' } },
    { identity: { ...identity, userId: '' } },
    { identity: { ...identity, operationKey: 'a'.repeat(64) } },
    { claim: { ...claim, ownerToken: '' } },
    { pendingNodes: ['research'] },
    { pendingNodes: ['analysis', 'research'] },
    { requestDigest: 'not-a-digest' },
  ])('rejects mismatched recovery evidence before reading Mongo', async (override) => {
    const h = setup();
    await expect(h.prove({ candidate, claim, identity, requestDigest, pendingNodes, ...override }))
      .rejects.toThrow('NATIVE_COLD_GRAPH_RECEIPT_IDENTITY_DENIED');
    expect(h.store.readOriginalNativeGraph).not.toHaveBeenCalled();
  });
  it.each([
    { status: 'dispatched', resultAvailable: false, response: null },
    { status: 'outcome_unknown', resultAvailable: false },
    { status: 'result_committed', resultAvailable: true, response: null },
  ])('refuses missing or ambiguous provider outcomes', async (receipt) => {
    const h = setup(receipt);
    await expect(h.prove({ candidate, claim, identity, requestDigest, pendingNodes }))
      .rejects.toThrow('NATIVE_COLD_GRAPH_RECEIPT_UNAVAILABLE');
  });
  it('does not read a result without the durable original request intent', async () => {
    const h = setup();
    h.intentStore.readOriginalIntent.mockResolvedValue(null);
    await expect(h.prove({ candidate, claim, identity, requestDigest, pendingNodes }))
      .rejects.toThrow('NATIVE_COLD_GRAPH_ORIGINAL_INTENT_UNVERIFIED');
    expect(h.store.readOriginalNativeGraph).not.toHaveBeenCalled();
  });
  it('recovers the digest only from the immutable Mongo intent', async () => {
    const h = setup();
    await expect(h.prove({ candidate, claim, identity, pendingNodes }))
      .resolves.toMatchObject({ requestDigest });
    expect(h.store.readOriginalNativeGraph)
      .toHaveBeenCalledWith({ identity, requestDigest });
  });
  it('rejects a caller supplied digest differing from the original', async () => {
    const h = setup();
    await expect(h.prove({ candidate, claim, identity,
      requestDigest: 'b'.repeat(64), pendingNodes }))
      .rejects.toThrow('NATIVE_COLD_GRAPH_ORIGINAL_INTENT_UNVERIFIED');
    expect(h.store.readOriginalNativeGraph).not.toHaveBeenCalled();
  });
  it('rejects revoked authorization after Mongo receipt read', async () => {
    const h = setup();
    h.assertAuthorized.mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('REVOKED'));
    await expect(h.prove({ candidate, claim, identity, requestDigest, pendingNodes }))
      .rejects.toThrow('REVOKED');
    expect(h.store.readOriginalNativeGraph).toHaveBeenCalledTimes(1);
  });
});
