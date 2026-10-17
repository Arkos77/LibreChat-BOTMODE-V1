const {
  createNativeMissionRecoveredOracleVerifier,
} = require('./nativeMissionRecoveredOracleVerifier');
const {
  createNativeMissionRecoveredTerminalPublisher,
} = require('./nativeMissionRecoveredTerminalPublisher');
const { readNativeMissionRecoveredGraphOutputs } = require('./nativeMissionRecoveredGraphOutput');

/** Bind real durable Oracle QA and terminal publication for already authorized,
 * model-only cold clients. Replay receipts/effect fencing and the full run
 * factory remain independently mandatory; this is NOT a recovery scheduler.
 * A fan-out with more than one terminal output has no canonical user-facing
 * answer and is refused instead of silently picking one.
 */
function createNativeMissionModelOnlyRecoveryCallbacks({
  manager,
  validateMissionTask,
  normalizeOracleState,
  areMissionOracleResultsEquivalent,
  getConversation,
  getMessage,
  saveMessage,
  sanitizeMessage,
  emitDone,
}) {
  if (
    typeof manager?.getJobStore !== 'function' ||
    [
      validateMissionTask,
      normalizeOracleState,
      areMissionOracleResultsEquivalent,
      getConversation,
      getMessage,
      saveMessage,
      sanitizeMessage,
      emitDone,
    ].some((callback) => typeof callback !== 'function')
  ) {
    throw new Error('NATIVE_RECOVERY_MODEL_ONLY_CALLBACKS_DEPENDENCIES_MISSING');
  }
  const oracle = async ({ client, graph, candidate, assertAuthorized }) =>
    createNativeMissionRecoveredOracleVerifier({
      store: manager.getJobStore(),
      client,
      graph,
      candidate,
      assertAuthorized,
      validateMissionTask,
      areMissionOracleResultsEquivalent,
      normalizeOracleState,
    });
  const publication = async ({ client, graph, candidate, claim, assertAuthorized }) => {
    const store = manager.getJobStore();
    const publishTerminal = createNativeMissionRecoveredTerminalPublisher({
      store,
      candidate,
      claim,
      assertAuthorized,
      getConversation,
      getMessage,
      saveMessage,
      sanitizeMessage,
      emitDone,
    });
    const getCandidate = async () => {
      await assertAuthorized();
      if (manager.getJobStore() !== store) {
        throw new Error('NATIVE_RECOVERY_PUBLICATION_STORE_REPLACED');
      }
      const job = await store.getJob(candidate.streamId);
      const plan = job?.orchestratorPlan;
      if (
        job?.createdAt !== candidate.createdAt ||
        job?.status !== 'running' ||
        job?.checkpointNamespace !== candidate.checkpointNamespace ||
        !Array.isArray(plan?.tasks) ||
        plan.tasks.length === 0 ||
        JSON.stringify(plan) !== JSON.stringify(client.orchestratorPlan)
      ) {
        throw new Error('NATIVE_RECOVERY_PUBLICATION_PLAN_DENIED');
      }
      const dependencies = new Set(plan.tasks.flatMap((task) => task.dependsOn ?? []));
      const terminal = plan.tasks.filter((task) => !dependencies.has(task.key));
      if (terminal.length !== 1) {
        throw new Error('NATIVE_RECOVERY_PUBLICATION_OUTPUT_AMBIGUOUS');
      }
      const config = {
        configurable: {
          thread_id: candidate.streamId,
          checkpoint_ns: '',
          __librechat_checkpoint_ns: candidate.checkpointNamespace,
          __librechat_mission_sync: true,
        },
      };
      const snapshot = await graph.getState(config);
      const taskOutputs = readNativeMissionRecoveredGraphOutputs({
        state: snapshot,
        plan,
        originalModelOnly:
          job.nativeMissionCapabilityAttestation?.mode === 'model_only' &&
          typeof client.options.nativeMissionReplayReceiptProof === 'function',
      });
      const text = taskOutputs[terminal[0].nodeId]?.content;
      if (typeof text !== 'string' || !text.trim()) {
        throw new Error('NATIVE_RECOVERY_PUBLICATION_GRAPH_NOT_FINAL');
      }
      const verified = normalizeOracleState(job.missionOracleState);
      if (
        Object.keys(verified.results).length !== plan.tasks.length ||
        plan.tasks.some(
          (task) =>
            verified.results[task.taskId]?.nodeId !== task.nodeId ||
            verified.results[task.taskId]?.verdicts?.length !== task.validation.length ||
            verified.results[task.taskId].verdicts.some(
              (verdict) =>
                verdict?.status !== 'VERIFIED' ||
                verdict?.input?.candidate !== taskOutputs[task.nodeId]?.content,
            ),
        )
      ) {
        throw new Error('NATIVE_RECOVERY_PUBLICATION_ORACLE_MISMATCH');
      }
      await assertAuthorized();
      return {
        content: [{ type: 'text', text }],
        attachments: [],
        oracle: verified,
      };
    };
    return { getCandidate, publishTerminal };
  };
  return { oracle, publication };
}

module.exports = { createNativeMissionModelOnlyRecoveryCallbacks };
