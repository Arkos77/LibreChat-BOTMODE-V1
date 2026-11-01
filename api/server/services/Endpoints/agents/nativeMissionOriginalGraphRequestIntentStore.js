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
    // Provider/model/agent are NOT part of the slot: a modified binding
    // cannot allocate an additional request against the same graph node.
    const slotKey = hash(Object.fromEntries(FIELDS.filter(
      (name) => !['agentId', 'provider', 'model'].includes(name)
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
  const equals = (observed, expected) =>
    observed?.slotKey === expected.slotKey &&
    observed.requestDigest === expected.requestDigest &&
    JSON.stringify(observed.identity) === JSON.stringify(expected.identity);
  const verify = async (input) => {
    const exact = validate(input);
    const observed = await collection.findOne({ slotKey: exact.slotKey });
    return equals(observed, exact);
  };
  const register = async (input) => {
    const exact = validate(input);
    await ensureIndex();
    try {
      await collection.insertOne({
        ...exact,
        registeredAt: new Date(),
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
    if (!(await verify(input))) fail('NATIVE_GRAPH_REQUEST_INTENT_IMMUTABLE_CONFLICT');
    return true;
  };
  return Object.freeze({ register, verify });
}

module.exports = { createNativeMissionOriginalGraphRequestIntentStore };
