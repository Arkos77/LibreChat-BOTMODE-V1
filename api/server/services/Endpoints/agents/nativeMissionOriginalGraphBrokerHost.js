'use strict';

const {
  createNativeMissionOriginalGraphBrokerModelFetchFactory,
} = require('./nativeMissionOriginalGraphBrokerModelFetch');
const { canonicalMissionJson } = require('./nativeMissionWakeupOriginStore');

const HEX = /^[a-f0-9]{64}$/;
const isId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 256;
function deny(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

/**
 * Original DIRECT LangGraph model-node admission. Unlike the existing
 * detached-child broker, this does not authorize spawning a child thread.
 *
 * The caller must supply the re-read, integrity-checked Mongo origin AFTER
 * the real HTTP admission has persisted it. The independent broker makes
 * a SECOND authorization from its own Mongo/ACL/checkpoint sources.
 *
 * No host / incomplete host => NO direct graph transport is installed.
 * An operator cannot activate this without a real graph checkpoint reader.
 */
function createNativeMissionOriginalGraphBrokerHost({
  readOriginalGraphCheckpoint,
  readRecoveredGraphCheckpoint,
  recordOriginalModelRequest,
  resolveModelBinding,
  brokerUrl,
  secret,
  fetchImpl,
}) {
  if (
    typeof readOriginalGraphCheckpoint !== 'function' ||
    typeof recordOriginalModelRequest !== 'function' ||
    typeof resolveModelBinding !== 'function' ||
    typeof brokerUrl !== 'string' || !brokerUrl ||
    typeof secret !== 'string' || secret.length < 32
  ) deny('NATIVE_GRAPH_BROKER_HOST_DEPENDENCIES_MISSING');

  return Object.freeze({
    makeRecoveryFetchFactory: (args) => {
      if (typeof readRecoveredGraphCheckpoint !== 'function') {
        deny('NATIVE_GRAPH_BROKER_COLD_CHECKPOINT_READER_MISSING');
      }
      return makeFactory(args, true);
    },
    makeRecoveryFetchFactoryWithReader: (args, reader) => {
      if (typeof reader !== 'function') {
        deny('NATIVE_GRAPH_BROKER_COLD_CHECKPOINT_READER_MISSING');
      }
      return makeFactory(args, true, reader);
    },
    makeMissionFetchFactory: (args) => makeFactory(args, false),
  });

  function makeFactory({ original, plan, capabilityAttestation, client }, recoveryOnly, reader) {
      if (
        !original ||
        !client || client.orchestratorPlan !== plan ||
        !isId(original.userId) ||
        !isId(original.conversationId) ||
        !isId(original.parentResponseMessageId) ||
        !Number.isSafeInteger(original.originalCreatedAt) ||
        original.originalCreatedAt <= 0 ||
        !isId(original.checkpointNamespace) ||
        !HEX.test(original.fingerprint) ||
        !isId(plan?.planId) ||
        !Array.isArray(plan.tasks) ||
        plan.tasks.length < 2 ||
        capabilityAttestation?.mode !== 'receipts_required' ||
        capabilityAttestation?.planId !== plan.planId ||
        original.planId !== plan.planId ||
        original.capabilityAttestation?.planId !== plan.planId ||
        canonicalMissionJson(original.plan) !== canonicalMissionJson(plan) ||
        canonicalMissionJson(original.capabilityAttestation) !==
          canonicalMissionJson(capabilityAttestation) ||
        plan.tasks.some((task) =>
          !isId(task?.nodeId) || !isId(task?.taskId) || !isId(task?.agentId)) ||
        new Set(plan.tasks.map((task) => task.nodeId)).size !== plan.tasks.length
      ) deny('NATIVE_GRAPH_BROKER_ORIGINAL_MISSION_UNVERIFIED');

      const selected = new Map(plan.tasks.map((task) => [task.nodeId, task]));
      const getScope = (binding) => {
        const task = selected.get(binding?.nodeId);
        if (
          !task ||
          task.agentId !== binding.agentId ||
          task.taskId !== binding.taskId
        ) deny('NATIVE_GRAPH_BROKER_ORIGINAL_ACTOR_NOT_SELECTED');
        return Object.freeze({
          userId: original.userId,
          tenantId: original.tenantId ?? '',
          streamId: original.conversationId,
          responseMessageId: original.parentResponseMessageId,
          generationCreatedAt: original.originalCreatedAt,
          checkpointNamespace: original.checkpointNamespace,
          nodeId: task.nodeId,
          taskId: task.taskId,
          agentId: task.agentId,
          ...(recoveryOnly ? { recoveryOnly: true } : {}),
        });
      };
      const approved = createNativeMissionOriginalGraphBrokerModelFetchFactory({
        getScope,
        getOriginalCheckpointReference: (scope) =>
          (recoveryOnly ? (reader ?? readRecoveredGraphCheckpoint) : readOriginalGraphCheckpoint)(
            { scope, plan, client }),
        recordOriginalModelRequest,
        resolveModelBinding,
        brokerUrl,
        secret,
        ...(fetchImpl && { fetchImpl }),
      });
      return (binding) => {
        // Do not silently route unselected graph nodes to the original
        // provider. Compilation only installs this for supported model-only
        // tasks; Research/tool nodes cannot become unreceipted model effects.
        getScope(binding);
        return approved(binding);
      };
  }
}

/** Called only after reading the immutable origin from Mongo. This function
 * never derives the original identity from req.body, Redis, or model output.
 */
function bindNativeMissionOriginalGraphBrokerForAcceptedMission({
  client,
  brokerHost,
  original,
  plan,
  capabilityAttestation,
}) {
  if (brokerHost == null) return false;
  if (
    typeof brokerHost.makeMissionFetchFactory !== 'function' ||
    !client?.options ||
    client.options.nativeGraphModelFetchFactory != null ||
    client.options.agent?.id !== original?.agentId ||
    // On a new original turn, BaseClient.setMessageOptions() has not run
    // yet: client.user and client.conversationId are still undefined.
    // The live, authenticated Express request is already bound to this
    // initialized AgentClient. Require it to match original Mongo provenance
    // when present, and never accept a conflicting post-initialized identity.
    (client.options.req != null &&
      (String(client.options.req.user?.id ?? '') !== original?.userId ||
       client.options.req.body?.conversationId !== original?.conversationId)) ||
    (client.conversationId == null
      ? client.options.req?.body?.conversationId !== original?.conversationId
      : client.conversationId !== original?.conversationId) ||
    client.jobCreatedAt !== original?.originalCreatedAt ||
    client.checkpointNamespace !== original?.checkpointNamespace ||
    (client.user == null
      ? String(client.options.req?.user?.id ?? '') !== original?.userId
      : String(client.user) !== original?.userId) ||
    canonicalMissionJson(client.orchestratorPlan) !== canonicalMissionJson(plan)
  ) deny('NATIVE_GRAPH_BROKER_CLIENT_ORIGINAL_MISSION_MISMATCH');

  // Build and validate the complete original mission transport before
  // touching the existing client. An exception leaves the original client
  // unchanged and fails the accepted run, rather than falling back silently.
  const factory = brokerHost.makeMissionFetchFactory({
    original, plan, capabilityAttestation, client,
  });
  if (typeof factory !== 'function') {
    deny('NATIVE_GRAPH_BROKER_FETCH_FACTORY_MISSING');
  }
  client.options.nativeGraphModelFetchFactory = factory;
  return true;
}

module.exports = {
  createNativeMissionOriginalGraphBrokerHost,
  bindNativeMissionOriginalGraphBrokerForAcceptedMission,
};
