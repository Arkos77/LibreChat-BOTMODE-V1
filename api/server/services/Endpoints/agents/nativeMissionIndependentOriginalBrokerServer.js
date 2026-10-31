'use strict';

const {
  createNativeMissionIndependentOriginalBrokerAuthority,
} = require('./nativeMissionIndependentOriginalBrokerAuthority');
const {
  createNativeMissionProviderCallReceiptStore,
} = require('./nativeMissionProviderCallReceiptStore');
const { createNativeMissionProviderCallBroker } = require('./nativeMissionProviderCallBroker');
const {
  createNativeMissionProviderBrokerHttpServer,
  requestDigest,
} = require('./nativeMissionProviderBrokerHttp');

/**
 * Independent process assembly for an ORIGINAL detached-child provider effect.
 * All evidence readers and current permission/lease checks must be bound to
 * real stores by the broker operator. No test identity, API request, model
 * prompt or recoverable Redis slot may override these dependencies.
 *
 * This creates a server but does NOT listen or launch a provider. The caller
 * must deploy it in a separate process that survives LibreChat API SIGKILL.
 */
function createNativeMissionIndependentOriginalBrokerServer({
  collection,
  sendProvider,
  secret,
  provider,
  findOriginalOperation,
  getMissionOrigin,
  getConvo,
  getStartReceipt,
  readOriginalCheckpoint,
  authorizeCurrentOwner,
  canViewAgent,
  inspectOriginalChildOwner,
  getCurrentModelBinding,
}) {
  const authorizeScope = createNativeMissionIndependentOriginalBrokerAuthority({
    findOriginalOperation,
    getMissionOrigin,
    getConvo,
    getStartReceipt,
    readOriginalCheckpoint,
    authorizeCurrentOwner,
    canViewAgent,
    inspectOriginalChildOwner,
    getCurrentModelBinding,
  });
  const store = createNativeMissionProviderCallReceiptStore({ collection });
  const assertAuthorized = async ({ identity, requestDigest: digest, authorizedRequest }) => {
    if (
      authorizedRequest == null ||
      authorizedRequest.model !== identity?.model ||
      authorizedRequest.stream !== false ||
      !Array.isArray(authorizedRequest.messages) ||
      authorizedRequest.tools != null ||
      authorizedRequest.tool_choice != null ||
      requestDigest(authorizedRequest) !== digest ||
      (await authorizeScope({ identity, requestDigest: digest, operation: 'execute' })) !== true
    ) {
      throw new Error('NATIVE_BROKER_ORIGINAL_DISPATCH_DENIED');
    }
  };
  const broker = createNativeMissionProviderCallBroker({
    store,
    sendProvider,
    assertAuthorized,
  });
  return createNativeMissionProviderBrokerHttpServer({
    store,
    broker,
    secret,
    provider,
    authorizeScope,
  });
}

module.exports = { createNativeMissionIndependentOriginalBrokerServer };
