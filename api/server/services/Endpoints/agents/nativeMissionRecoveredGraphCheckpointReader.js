'use strict';

const {
  createNativeMissionOriginalGraphCheckpointReader,
} = require('./nativeMissionOriginalGraphCheckpointReader');

/**
 * Read the recovered ORIGINAL durable graph head, not an active API graph.
 * Only the authenticated cold owner can install this reader.
 */
function createNativeMissionRecoveredGraphCheckpointReader({ getRecoveryContext }) {
  if (typeof getRecoveryContext !== 'function') {
    throw new Error('NATIVE_COLD_GRAPH_READER_CONTEXT_MISSING');
  }
  const read = createNativeMissionOriginalGraphCheckpointReader({
    getGraph: async ({ scope, client }) => {
      const context = await getRecoveryContext();
      if (!context || context.client !== client ||
          context.candidate?.streamId !== scope.streamId ||
          context.candidate?.createdAt !== scope.generationCreatedAt ||
          context.candidate?.checkpointNamespace !== scope.checkpointNamespace ||
          context.candidate?.checkpointId !== context.claim?.checkpointId ||
          typeof context.assertAuthorized !== 'function' ||
          typeof context.graph?.getState !== 'function') {
        throw new Error('NATIVE_COLD_GRAPH_READER_OWNER_MISMATCH');
      }
      await context.assertAuthorized();
      return context.graph;
    },
  });
  return async ({ scope, plan, client }) => {
    const context = await getRecoveryContext();
    if (!context || context.client !== client ||
        client?.orchestratorPlan !== plan ||
        client?.conversationId !== scope?.streamId ||
        client?.jobCreatedAt !== scope?.generationCreatedAt ||
        client?.checkpointNamespace !== scope?.checkpointNamespace ||
        client?.responseMessageId !== scope?.responseMessageId ||
        String(client?.user ?? '') !== scope?.userId ||
        context.candidate?.checkpointId !== context.claim?.checkpointId ||
        typeof context.assertAuthorized !== 'function') {
      throw new Error('NATIVE_COLD_GRAPH_READER_ORIGIN_MISMATCH');
    }
    await context.assertAuthorized();
    const result = await read({
      scope, plan, client, expectedCheckpointId: context.candidate.checkpointId,
    });
    await context.assertAuthorized();
    return result;
  };
}

module.exports = { createNativeMissionRecoveredGraphCheckpointReader };
