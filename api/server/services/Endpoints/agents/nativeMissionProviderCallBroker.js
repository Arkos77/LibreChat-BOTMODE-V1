'use strict';

/** Runs exclusively inside an independent process, never in the API that may
 * receive SIGKILL. The caller MUST establish current user/tenant ACL, original
 * model bindings, cost ceiling and authentic request digest before calling.
 * This function is not registered as a live provider transport yet.
 */
function createNativeMissionProviderCallBroker({ store, sendProvider, assertAuthorized }) {
  if (
    !store ||
    ['prepare', 'claim', 'dispatch', 'commit', 'markUnknown', 'read'].some(
      (name) => typeof store[name] !== 'function',
    ) ||
    typeof sendProvider !== 'function' ||
    typeof assertAuthorized !== 'function'
  ) {
    throw new Error('NATIVE_PROVIDER_BROKER_DEPENDENCIES_MISSING');
  }
  return Object.freeze({
    execute: async ({ identity, requestDigest, authorizedRequest }) => {
      // This broker does not persist raw prompts or provider credentials.
      const scope = { identity, requestDigest };
      await assertAuthorized({ ...scope, authorizedRequest });
      await store.prepare(scope);
      const claimed = await store.claim(scope);
      if (!claimed.accepted) {
        // No attempts are retried after a dispatch (or ambiguous crash).
        return store.read(scope);
      }
      const ownerToken = claimed.ownerToken;
      // Recheck authority immediately before the irreversible dispatch phase.
      await assertAuthorized({ ...scope, authorizedRequest });
      // Durable ambiguous-outcome marker BEFORE any provider HTTP effect.
      await store.dispatch({ ...scope, ownerToken });
      try {
        const response = await sendProvider(authorizedRequest);
        await store.commit({ ...scope, ownerToken, response });
      } catch (error) {
        // A failed network call could have completed at the provider. Do not
        // infer it was never delivered or automatically reissue it.
        await store.markUnknown({ ...scope, ownerToken }).catch(() => {});
        throw error;
      }
      return store.read(scope);
    },
  });
}

module.exports = { createNativeMissionProviderCallBroker };
