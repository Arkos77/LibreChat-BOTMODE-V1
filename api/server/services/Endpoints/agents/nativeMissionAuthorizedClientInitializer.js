const {
  createNativeMissionAuthenticatedRecoveryContext,
} = require('./nativeMissionAuthenticatedRecoveryContext');

/** Bridge verified host documents to a request-independent client initializer.
 * Never construct a request/session or infer execution grants from Redis.
 * The implementation must be the real host model/tool initializer; absence
 * of that implementation is a hard refusal, not a synthetic fallback.
 */
function createNativeMissionAuthorizedClientInitializer({
  manager,
  authorizationDeps,
  initializeClientFromDocuments,
}) {
  if (
    typeof manager?.getJobStore !== 'function' ||
    typeof initializeClientFromDocuments !== 'function'
  ) {
    throw new Error('NATIVE_MISSION_AUTHENTICATED_INITIALIZER_UNAVAILABLE');
  }
  const readContext = createNativeMissionAuthenticatedRecoveryContext(authorizationDeps);
  return async ({ candidate, claim, assertAuthorized }) => {
    if (
      !claim ||
      !candidate ||
      candidate.streamId !== claim.streamId ||
      candidate.createdAt !== claim.createdAt ||
      candidate.checkpointNamespace !== claim.checkpointNamespace ||
      candidate.checkpointId !== claim.checkpointId ||
      typeof claim.ownerToken !== 'string' ||
      !claim.ownerToken ||
      typeof assertAuthorized !== 'function'
    ) {
      throw new Error('NATIVE_MISSION_AUTHENTICATED_INITIALIZER_CLAIM_DENIED');
    }
    await assertAuthorized();
    const store = manager.getJobStore();
    if (typeof store?.getJob !== 'function') {
      throw new Error('NATIVE_MISSION_AUTHENTICATED_INITIALIZER_STORE_MISSING');
    }
    const job = await store.getJob(candidate.streamId);
    const context = await readContext({ candidate, job });
    await assertAuthorized();
    const client = await initializeClientFromDocuments({
      candidate,
      claim,
      job,
      context,
      assertAuthorized,
    });
    if (
      manager.getJobStore() !== store ||
      !client ||
      client.conversationId !== candidate.streamId ||
      client.options?.agent?.id !== job.agent_id ||
      client.options?.req?.user !== context.user ||
      client.options?.req?.body?.conversationId !== candidate.streamId ||
      client.options?.req?.config == null ||
      typeof client.createNativeMissionColdRunOptions !== 'function'
    ) {
      throw new Error('NATIVE_MISSION_AUTHENTICATED_INITIALIZER_CLIENT_DENIED');
    }
    await assertAuthorized();
    return { client, job };
  };
}

module.exports = { createNativeMissionAuthorizedClientInitializer };
