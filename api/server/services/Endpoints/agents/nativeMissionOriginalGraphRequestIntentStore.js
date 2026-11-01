'use strict';

const { createHash } = require('node:crypto');

const SHA = /^[a-f0-9]{64}$/;
const FIELDS = [
  'mode', 'userId', 'tenantId', 'streamId', 'responseMessageId',
  'generationCreatedAt', 'checkpointNamespace', 'graphCheckpointId',
  'nodeId', 'taskId', 'agentId', 'provider', 'model',
];
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/**
 * Durable, once-only intent authored by the ORIGINAL SDK graph host after
 * checking its live pending node, before even asking the separate broker to
 * send the provider request. No prompt, credentials or provider reply stored.
 *
 * The independent broker must ALSO check user/tenant ACL, mission provenance,
 * graph head and original live execution lease. This intent proves ONLY the
 * original canonical request digest and exact graph-step/provider binding.
 * A recovered API cannot register a new intent to replay an ambiguous call.
 */
function createNativeMissionOriginalGraphRequestIntentStore({ collection }) {
  if (!collection || ['createIndex', 'insertOne', 'findOne'].some(
    (name) => typeof collection[name] !== 'function')) {
    fail('NATIVE_GRAPH_REQUEST_INTENT_STORE_MISSING');
  }
  const validate = ({ identity, requestDigest }) => {
    if (
      identity?.mode !== 'native_graph' ||
      !Number.isSafeInteger(identity.generationCreatedAt) ||
      identity.generationCreatedAt <= 0 ||
      FIELDS.some((name) =>
        name !== 'generationCreatedAt' &&
        (typeof identity[name] !== 'string' ||
          (name !== 'tenantId' && !identity[name]) ||
          identity[name].length > 256)) ||
      Object.prototype.hasOwnProperty.call(identity, 'operationKey') ||
      !SHA.test(requestDigest)
    ) fail('NATIVE_GRAPH_REQUEST_INTENT_INVALID');
    const original = Object.fromEntries(FIELDS.map((name) => [name, identity[name]]));
    // Provider/model/agent AND checkpoint ID are NOT part of the slot:
    // a changed checkpoint must not allocate another original node call
    // within the same generation. Exact checkpoint remains part of identity.
    const slotKey = hash(Object.fromEntries(FIELDS.filter(
      (name) => !['agentId', 'provider', 'model', 'graphCheckpointId'].includes(name)
    ).map((name) => [name, original[name]])));
    return { slotKey, identity: original, requestDigest };
  };
  let indexPromise;
  const ensureIndex = () => {
    if (!indexPromise) {
      indexPromise = collection.createIndex(
        { slotKey: 1 },
        { unique: true, name: 'native_original_graph_request_intent_slot_unique' }
      ).catch((error) => { indexPromise = undefined; throw error; });
    }
    return indexPromise;
  };
  const validateProof = (identity, proof) =>
    proof != null &&
    proof.threadId === identity.streamId &&
    proof.checkpointNamespace === identity.checkpointNamespace &&
    proof.checkpointId === identity.graphCheckpointId &&
    Array.isArray(proof.pendingNodes) &&
    proof.pendingNodes.length === 1 &&
    proof.pendingNodes[0] === identity.nodeId;
  const equals = (observed, expected) =>
    observed?.slotKey === expected.slotKey &&
    observed.requestDigest === expected.requestDigest &&
    JSON.stringify(observed.identity) === JSON.stringify(expected.identity) &&
    validateProof(expected.identity, observed.checkpointProof);
  const verify = async (input) => {
    const exact = validate(input);
    const observed = await collection.findOne({ slotKey: exact.slotKey });
    return equals(observed, exact);
  };
  const readProof = async (input) => {
    const exact = validate(input);
    const observed = await collection.findOne({ slotKey: exact.slotKey });
    if (!equals(observed, exact)) return null;
    return Object.freeze({
      threadId: observed.checkpointProof.threadId,
      checkpointNamespace: observed.checkpointProof.checkpointNamespace,
      checkpointId: observed.checkpointProof.checkpointId,
      pendingNodes: Object.freeze([...observed.checkpointProof.pendingNodes]),
    });
  };
  // Recovery lookup accepts the full host-authenticated operation identity,
  // never an inferred digest. The immutable original digest comes from Mongo.
  const readOriginalIntent = async ({ identity }) => {
    if (!identity || typeof identity !== 'object' ||
        Object.prototype.hasOwnProperty.call(identity, 'operationKey')) {
      fail('NATIVE_GRAPH_ORIGINAL_INTENT_IDENTITY_INVALID');
    }
    const exact = validate({ identity, requestDigest: '0'.repeat(64) });
    const observed = await collection.findOne({ slotKey: exact.slotKey });
    if (!observed || !SHA.test(observed.requestDigest) ||
        observed.slotKey !== exact.slotKey ||
        JSON.stringify(observed.identity) !== JSON.stringify(exact.identity) ||
        !validateProof(exact.identity, observed.checkpointProof)) {
      fail('NATIVE_GRAPH_ORIGINAL_INTENT_NOT_VERIFIED');
    }
    return Object.freeze({
      identity: Object.freeze({ ...exact.identity }),
      requestDigest: observed.requestDigest,
      checkpointProof: Object.freeze({
        threadId: observed.checkpointProof.threadId,
        checkpointNamespace: observed.checkpointProof.checkpointNamespace,
        checkpointId: observed.checkpointProof.checkpointId,
        pendingNodes: Object.freeze([...observed.checkpointProof.pendingNodes]),
      }),
    });
  };
  const register = async (input) => {
    const exact = validate(input);
    if (!validateProof(exact.identity, input.checkpointProof)) {
      fail('NATIVE_GRAPH_REQUEST_INTENT_CHECKPOINT_PROOF_MISSING');
    }
    await ensureIndex();
    try {
      await collection.insertOne({
        ...exact,
        checkpointProof: {
          threadId: exact.identity.streamId,
          checkpointNamespace: exact.identity.checkpointNamespace,
          checkpointId: exact.identity.graphCheckpointId,
          pendingNodes: [exact.identity.nodeId],
        },
        registeredAt: new Date(),
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
    if (!(await verify(input))) fail('NATIVE_GRAPH_REQUEST_INTENT_IMMUTABLE_CONFLICT');
    return true;
  };
  return Object.freeze({ register, verify, readProof, readOriginalIntent });
}

/**
 * Broker-side request verifier. An HMAC alone cannot prove that the model
 * prompt was issued by the original graph; verify the exact durable intent.
 * The separate graph authority also verifies live ACL, pending head & lease.
 */
function createNativeMissionOriginalGraphRequestVerifier({ intentStore }) {
  if (typeof intentStore?.verify !== 'function') {
    fail('NATIVE_GRAPH_REQUEST_INTENT_VERIFIER_MISSING');
  }
  const { requestDigest: canonicalDigest } = require('./nativeMissionProviderBrokerHttp');
  return async (scope) => {
    const body = scope?.authorizedRequest;
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        body.model !== scope.model || body.stream !== false ||
        !Array.isArray(body.messages) || body.tools != null ||
        body.tool_choice != null) return false;
    if (canonicalDigest(body) !== scope.requestDigest) return false;
    return intentStore.verify({
      identity: {
        mode: 'native_graph',
        userId: scope.userId,
        tenantId: scope.tenantId,
        streamId: scope.conversationId,
        responseMessageId: scope.responseMessageId,
        generationCreatedAt: scope.createdAt,
        checkpointNamespace: scope.checkpointNamespace,
        graphCheckpointId: scope.checkpointId,
        nodeId: scope.nodeId,
        taskId: scope.taskId,
        agentId: scope.agentId,
        provider: scope.provider,
        model: scope.model,
      },
      requestDigest: scope.requestDigest,
    });
  };
}

module.exports = {
  createNativeMissionOriginalGraphRequestIntentStore,
  createNativeMissionOriginalGraphRequestVerifier,
};
