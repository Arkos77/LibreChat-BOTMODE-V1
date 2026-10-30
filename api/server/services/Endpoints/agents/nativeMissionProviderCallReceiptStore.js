'use strict';

const { createHash, randomUUID } = require('node:crypto');

/** Private, durable model-call journal for an independent execution owner.
 * No component here sends model requests or grants permission to replay them.
 * This code is intentionally not registered in the API runtime yet.
 */
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
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const HEX_DIGEST = /^[a-f0-9]{64}$/;

function refuse(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function fingerprint(value) {
  return createHash('sha256').update(value).digest('hex');
}

function identify(input) {
  if (
    !input ||
    ID_FIELDS.some(
      (key) =>
        typeof input[key] !== 'string' ||
        (key !== 'tenantId' && input[key].length === 0) ||
        input[key].length > 256,
    ) ||
    !HEX_DIGEST.test(input.operationKey)
  ) {
    refuse('NATIVE_PROVIDER_CALL_IDENTITY_INVALID');
  }
  const identity = Object.fromEntries(ID_FIELDS.map((key) => [key, input[key]]));
  return { identity, callKey: fingerprint(JSON.stringify(identity)) };
}

function requireDigest(digest) {
  if (typeof digest !== 'string' || !HEX_DIGEST.test(digest)) {
    refuse('NATIVE_PROVIDER_CALL_DIGEST_INVALID');
  }
}

function publicStatus(record) {
  return Object.freeze({
    status: record.status,
    callKey: record.callKey,
    dispatched: record.dispatchedAt != null,
    resultAvailable: record.status === 'result_committed',
    // No credentials, prompts, outputs or owner tokens escape status reads.
  });
}

function createNativeMissionProviderCallReceiptStore({ collection, makeToken = randomUUID }) {
  if (
    !collection ||
    ['createIndex', 'insertOne', 'findOne', 'findOneAndUpdate'].some(
      (name) => typeof collection[name] !== 'function',
    ) ||
    typeof makeToken !== 'function'
  ) {
    refuse('NATIVE_PROVIDER_CALL_STORE_UNAVAILABLE');
  }
  let indexPromise;
  const ensureIndex = () => {
    if (!indexPromise) {
      indexPromise = collection
        .createIndex({ callKey: 1 }, { unique: true, name: 'native_provider_call_unique' })
        .catch((error) => {
          indexPromise = undefined;
          throw error;
        });
    }
    return indexPromise;
  };
  const match = (identity, requestDigest) => {
    requireDigest(requestDigest);
    const { callKey, identity: original } = identify(identity);
    return { callKey, identity: original, requestDigest };
  };
  const assertSame = (doc, expected) => {
    if (
      !doc ||
      doc.callKey !== expected.callKey ||
      doc.requestDigest !== expected.requestDigest ||
      JSON.stringify(doc.identity) !== JSON.stringify(expected.identity)
    ) {
      refuse('NATIVE_PROVIDER_CALL_IMMUTABLE_CONFLICT');
    }
    return doc;
  };
  const readOriginal = async (expected) => {
    const record = await collection.findOne({ callKey: expected.callKey });
    return assertSame(record, expected);
  };

  const prepare = async ({ identity, requestDigest }) => {
    const original = match(identity, requestDigest);
    await ensureIndex();
    try {
      await collection.insertOne({
        ...original,
        status: 'prepared',
        createdAt: new Date(),
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
    return publicStatus(await readOriginal(original));
  };

  const claim = async ({ identity, requestDigest }) => {
    const original = match(identity, requestDigest);
    await ensureIndex();
    await readOriginal(original);
    const ownerToken = makeToken();
    if (typeof ownerToken !== 'string' || ownerToken.length < 16) {
      refuse('NATIVE_PROVIDER_CALL_OWNER_INVALID');
    }
    const changed = await collection.findOneAndUpdate(
      { callKey: original.callKey, status: 'prepared', requestDigest },
      { $set: { status: 'claimed', ownerToken, claimedAt: new Date() } },
      { returnDocument: 'after' },
    );
    if (!changed) {
      return { accepted: false, ...publicStatus(await readOriginal(original)) };
    }
    assertSame(changed, original);
    return { accepted: true, ownerToken, ...publicStatus(changed) };
  };

  const transition = async ({ identity, requestDigest, ownerToken, from, to, data }) => {
    const original = match(identity, requestDigest);
    if (typeof ownerToken !== 'string' || ownerToken.length < 16) {
      refuse('NATIVE_PROVIDER_CALL_OWNER_INVALID');
    }
    const updated = await collection.findOneAndUpdate(
      { callKey: original.callKey, requestDigest, status: from, ownerToken },
      { $set: { status: to, ...data } },
      { returnDocument: 'after' },
    );
    if (!updated) refuse('NATIVE_PROVIDER_CALL_STALE_OWNER_OR_PHASE');
    assertSame(updated, original);
    return publicStatus(updated);
  };

  const dispatch = async ({ identity, requestDigest, ownerToken }) =>
    transition({
      identity,
      requestDigest,
      ownerToken,
      from: 'claimed',
      to: 'dispatched',
      data: { dispatchedAt: new Date() },
    });

  const markUnknown = async ({ identity, requestDigest, ownerToken }) =>
    transition({
      identity,
      requestDigest,
      ownerToken,
      from: 'dispatched',
      to: 'outcome_unknown',
      data: { outcomeUnknownAt: new Date() },
    });

  const commit = async ({ identity, requestDigest, ownerToken, response }) => {
    const responseJson = JSON.stringify(response);
    if (
      typeof responseJson !== 'string' ||
      Buffer.byteLength(responseJson, 'utf8') > MAX_RESPONSE_BYTES
    ) {
      refuse('NATIVE_PROVIDER_CALL_RESULT_INVALID');
    }
    const digest = fingerprint(responseJson);
    const original = match(identity, requestDigest);
    if (typeof ownerToken !== 'string' || ownerToken.length < 16) {
      refuse('NATIVE_PROVIDER_CALL_OWNER_INVALID');
    }
    // A late result from the exact original owner may resolve an ambiguous
    // dispatch; a different owner can neither re-dispatch nor forge a result.
    const updated = await collection.findOneAndUpdate(
      {
        callKey: original.callKey,
        requestDigest,
        status: { $in: ['dispatched', 'outcome_unknown'] },
        ownerToken,
      },
      {
        $set: {
          status: 'result_committed',
          responseJson,
          resultDigest: digest,
          committedAt: new Date(),
        },
      },
      { returnDocument: 'after' },
    );
    if (!updated) refuse('NATIVE_PROVIDER_CALL_STALE_OWNER_OR_PHASE');
    assertSame(updated, original);
    return publicStatus(updated);
  };

  const read = async ({ identity, requestDigest }) => {
    const original = match(identity, requestDigest);
    const doc = await readOriginal(original);
    if (doc.status !== 'result_committed') {
      return { ...publicStatus(doc), response: null };
    }
    if (
      typeof doc.responseJson !== 'string' ||
      typeof doc.resultDigest !== 'string' ||
      fingerprint(doc.responseJson) !== doc.resultDigest
    ) {
      refuse('NATIVE_PROVIDER_CALL_RESULT_INTEGRITY_FAILED');
    }
    let response;
    try {
      response = JSON.parse(doc.responseJson);
    } catch {
      refuse('NATIVE_PROVIDER_CALL_RESULT_INTEGRITY_FAILED');
    }
    return { ...publicStatus(doc), response };
  };

  return Object.freeze({ prepare, claim, dispatch, markUnknown, commit, read });
}

module.exports = { createNativeMissionProviderCallReceiptStore };
