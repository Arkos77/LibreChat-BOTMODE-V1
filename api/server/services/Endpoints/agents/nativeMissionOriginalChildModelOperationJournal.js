'use strict';

const { createHash } = require('node:crypto');

const ID_FIELDS = [
  'userId',
  'tenantId',
  'parentConversationId',
  'parentRunId',
  'childThreadId',
  'taskId',
  'attemptKey',
  'agentId',
  'provider',
  'model',
  'operationKey',
];
const SCOPE_FIELDS = [
  'userId',
  'tenantId',
  'parentConversationId',
  'parentRunId',
  'parentToolCallId',
  'childThreadId',
  'taskId',
  'attemptKey',
  'agentId',
];
const HASH = /^[a-f0-9]{64}$/;

function deny(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function bounded(v, empty = false) {
  return typeof v === 'string' && (empty || v.length > 0) && v.length <= 256;
}

function canonicalIdentity(identity) {
  if (
    !identity ||
    ID_FIELDS.some((field) => !bounded(identity[field], field === 'tenantId')) ||
    !HASH.test(identity.operationKey)
  ) {
    deny('NATIVE_ORIGINAL_MODEL_JOURNAL_IDENTITY_INVALID');
  }
  return Object.fromEntries(ID_FIELDS.map((field) => [field, identity[field]]));
}

function callKey(identity) {
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex');
}

function originalCoordinates({ identity, parentToolCallId, requestDigest, checkpointId }) {
  const original = canonicalIdentity(identity);
  if (!bounded(parentToolCallId) || !bounded(checkpointId) || !HASH.test(requestDigest)) {
    deny('NATIVE_ORIGINAL_MODEL_JOURNAL_PROOF_INVALID');
  }
  const scope = Object.fromEntries(
    SCOPE_FIELDS.map((field) => [
      field,
      field === 'parentToolCallId' ? parentToolCallId : original[field],
    ]),
  );
  return { original, scope, requestDigest, checkpointId, callKey: callKey(original) };
}

/**
 * Read/write seam for a REAL original model operation, persisted BEFORE any
 * provider network effect. A trusted host must prove current ACL + lease +
 * immutable mission origin and an exact model-operation graph checkpoint.
 *
 * This does not create a checkpoint, send a model request, run a child or
 * provide replay permission. The broker's CAS claims the same callKey later.
 * Never derive operationKey from prompt hash or from an arbitrary retry.
 */
function createNativeMissionOriginalChildModelOperationJournal({
  collection,
  authorizeOriginal,
  readOriginalCheckpoint,
}) {
  if (
    !collection ||
    ['createIndex', 'insertOne', 'findOne', 'find'].some(
      (name) => typeof collection[name] !== 'function',
    ) ||
    typeof authorizeOriginal !== 'function' ||
    typeof readOriginalCheckpoint !== 'function'
  ) {
    deny('NATIVE_ORIGINAL_MODEL_JOURNAL_DEPENDENCIES');
  }
  let indexPromise;
  function ensureIndex() {
    if (!indexPromise) {
      indexPromise = collection
        .createIndex({ callKey: 1 }, { name: 'native_provider_call_unique', unique: true })
        .catch((error) => {
          indexPromise = undefined;
          throw error;
        });
    }
    return indexPromise;
  }

  async function prove(coords) {
    // Caller must have persisted the ORIGINAL checkpoint before arriving here.
    const admission = await authorizeOriginal({
      scope: Object.freeze({ ...coords.scope }),
      provider: coords.original.provider,
      model: coords.original.model,
      operationKey: coords.original.operationKey,
      requestDigest: coords.requestDigest,
      checkpointId: coords.checkpointId,
    });
    if (
      admission?.approved !== true ||
      !HASH.test(admission.originFingerprint) ||
      admission.provider !== coords.original.provider ||
      admission.model !== coords.original.model ||
      admission.operationKey !== coords.original.operationKey ||
      admission.requestDigest !== coords.requestDigest ||
      admission.checkpointId !== coords.checkpointId ||
      !admission.scope ||
      SCOPE_FIELDS.some((field) => admission.scope[field] !== coords.scope[field])
    ) {
      deny('NATIVE_ORIGINAL_MODEL_JOURNAL_AUTHORITY_DENIED');
    }
    const checkpoint = await readOriginalCheckpoint({
      ...coords.scope,
      checkpointId: coords.checkpointId,
    });
    if (
      checkpoint?.checkpointId !== coords.checkpointId ||
      checkpoint?.taskId !== coords.scope.taskId ||
      checkpoint?.attemptKey !== coords.scope.attemptKey ||
      checkpoint?.childThreadId !== coords.scope.childThreadId ||
      checkpoint?.provider !== coords.original.provider ||
      checkpoint?.model !== coords.original.model ||
      checkpoint?.operationKey !== coords.original.operationKey ||
      checkpoint?.requestDigest !== coords.requestDigest
    ) {
      deny('NATIVE_ORIGINAL_MODEL_JOURNAL_CHECKPOINT_DENIED');
    }
    return admission.originFingerprint;
  }

  async function prepareOriginal(input) {
    const coords = originalCoordinates(input);
    const originFingerprint = await prove(coords);
    await ensureIndex();
    const operation = {
      callKey: coords.callKey,
      identity: coords.original,
      ...coords.scope,
      provider: coords.original.provider,
      model: coords.original.model,
      operationKey: coords.original.operationKey,
      requestDigest: coords.requestDigest,
      checkpointId: coords.checkpointId,
      originFingerprint,
    };
    try {
      await collection.insertOne({
        ...operation,
        status: 'prepared',
        createdAt: new Date(),
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
    const record = await collection.findOne({ callKey: coords.callKey });
    if (
      !record ||
      Object.entries(operation).some(([field, value]) =>
        field === 'identity'
          ? JSON.stringify(record.identity) !== JSON.stringify(value)
          : record[field] !== value,
      )
    ) {
      deny('NATIVE_ORIGINAL_MODEL_JOURNAL_IMMUTABLE_CONFLICT');
    }
    // A lease or ACL can be revoked while the unique insert is in flight.
    // The broker must independently recheck authority before dispatch.
    if ((await prove(coords)) !== originFingerprint) {
      deny('NATIVE_ORIGINAL_MODEL_JOURNAL_AUTHORITY_CHANGED');
    }
    return Object.freeze({
      callKey: coords.callKey,
      status: record.status,
      checkpointId: coords.checkpointId,
      operationKey: coords.original.operationKey,
      requestDigest: coords.requestDigest,
      // No provider response, owner token, prompt or secret leaks from this API.
    });
  }

  async function findOriginalOperations(query) {
    // A resolver does not know operationKey until it reads the original
    // checkpoint record. Searching cannot invent it from a prompt digest.
    if (
      !query ||
      SCOPE_FIELDS.some((field) => !bounded(query[field], field === 'tenantId')) ||
      !bounded(query.provider) ||
      !bounded(query.model) ||
      !HASH.test(query.requestDigest)
    ) {
      deny('NATIVE_ORIGINAL_MODEL_JOURNAL_QUERY_INVALID');
    }
    const scope = Object.fromEntries(SCOPE_FIELDS.map((field) => [field, query[field]]));
    const requestDigest = query.requestDigest;
    const cursor = collection
      .find({
        ...scope,
        provider: query.provider,
        model: query.model,
        requestDigest,
        originFingerprint: { $type: 'string' },
      })
      .limit(2);
    const rows = await cursor.toArray();
    if (!Array.isArray(rows) || rows.length > 2) {
      deny('NATIVE_ORIGINAL_MODEL_JOURNAL_READ_INVALID');
    }
    return rows.map((row) => ({
      ...Object.fromEntries(SCOPE_FIELDS.map((field) => [field, row[field]])),
      provider: row.provider,
      model: row.model,
      requestDigest: row.requestDigest,
      operationKey: row.operationKey,
      originFingerprint: row.originFingerprint,
      checkpointId: row.checkpointId,
      status: row.status,
    }));
  }

  return Object.freeze({ prepareOriginal, findOriginalOperations });
}

module.exports = { createNativeMissionOriginalChildModelOperationJournal };
