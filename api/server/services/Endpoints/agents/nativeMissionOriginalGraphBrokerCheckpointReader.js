'use strict';

const {
  createNativeMissionOriginalGraphCheckpointReader,
} = require('./nativeMissionOriginalGraphCheckpointReader');

/** The active, original SDK run owns the ONLY graph whose checkpoint is
 * admissible for initial model dispatch. Never reconstruct an unrelated
 * graph or infer a pending model node from a durable id alone.
 */
function createNativeMissionLiveGraphCheckpointReader() {
  const read = createNativeMissionOriginalGraphCheckpointReader({
    getGraph: async ({ client }) => {
      const original = client?.run;
      const graph = original?.Graph?.createWorkflow?.();
      if (!graph || typeof graph.getState !== 'function') {
        throw new Error('NATIVE_GRAPH_CHECKPOINT_ORIGINAL_RUNNING_GRAPH_MISSING');
      }
      return graph;
    },
  });
  return async ({ scope, plan, client }) => {
    if (
      !client ||
      client.conversationId !== scope?.streamId ||
      client.jobCreatedAt !== scope?.generationCreatedAt ||
      client.checkpointNamespace !== scope?.checkpointNamespace ||
      client.responseMessageId !== scope?.responseMessageId ||
      String(client.user ?? '') !== scope?.userId ||
      client.orchestratorPlan !== plan
    ) throw new Error('NATIVE_GRAPH_CHECKPOINT_ORIGINAL_CLIENT_MISMATCH');
    return read({ scope, plan, client });
  };
}
module.exports = { createNativeMissionLiveGraphCheckpointReader };
