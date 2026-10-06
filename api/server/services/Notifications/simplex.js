const { randomUUID } = require('crypto');
const { logger } = require('@librechat/data-schemas');

const DEFAULT_WS_URL = 'ws://127.0.0.1:5225';

function isLoopbackWebSocketUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'ws:' &&
      (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1')
    );
  } catch {
    return false;
  }
}

function buildSimpleXSendCommand(chatRef, message) {
  const composedMessages = [{ msgContent: { type: 'text', text: message } }];
  return '/_send ' + chatRef + ' json ' + JSON.stringify(composedMessages);
}

function resolveSimpleXConfig(env = process.env) {
  const chatRef =
    typeof env.SIMPLEX_BOT_CHAT_REF === 'string' ? env.SIMPLEX_BOT_CHAT_REF.trim() : '';
  if (!chatRef) {
    return { enabled: false };
  }
  const wsUrl =
    typeof env.SIMPLEX_BOT_WS_URL === 'string' && env.SIMPLEX_BOT_WS_URL.trim()
      ? env.SIMPLEX_BOT_WS_URL.trim()
      : DEFAULT_WS_URL;
  if (!isLoopbackWebSocketUrl(wsUrl)) {
    throw new Error('SIMPLEX_BOT_WS_URL must use ws:// on localhost/loopback only');
  }
  if (!/^[@#][^\s]+$/.test(chatRef)) {
    throw new Error('SIMPLEX_BOT_CHAT_REF must be an explicit SimpleX direct/group chat reference');
  }
  return { enabled: true, wsUrl, chatRef };
}

function sendWebSocketCommand({
  wsUrl,
  command,
  WebSocketImpl = globalThis.WebSocket,
  timeoutMs = 3000,
}) {
  if (typeof WebSocketImpl !== 'function') {
    return Promise.reject(new Error('WebSocket runtime is unavailable'));
  }
  return new Promise((resolve, reject) => {
    const socket = new WebSocketImpl(wsUrl);
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch (error) {
        logger.debug('[SimpleX] WebSocket close failed after notification', error);
      }
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(
      () => finish(new Error('SimpleX WebSocket notification timed out')),
      timeoutMs,
    );
    const onOpen = () => {
      try {
        socket.send(JSON.stringify({ corrId: randomUUID(), cmd: command }));
        finish();
      } catch (error) {
        finish(error);
      }
    };
    const onError = () => finish(new Error('SimpleX WebSocket notification failed'));
    if (typeof socket.addEventListener === 'function') {
      socket.addEventListener('open', onOpen, { once: true });
      socket.addEventListener('error', onError, { once: true });
    } else {
      socket.onopen = onOpen;
      socket.onerror = onError;
    }
  });
}

function createSimpleXPendingActionNotifier({
  env = process.env,
  WebSocketImpl = globalThis.WebSocket,
  timeoutMs = 3000,
} = {}) {
  const config = resolveSimpleXConfig(env);
  if (!config.enabled) {
    return undefined;
  }

  return async (streamId, job) => {
    const pendingAction = job?.pendingAction;
    if (!pendingAction?.actionId) return;
    const actionType =
      typeof pendingAction.type === 'string' && pendingAction.type.trim()
        ? pendingAction.type.trim()
        : 'validation';
    const message =
      'BOT MODE attend une validation dans LibreChat. ' +
      'Type: ' +
      actionType +
      '. Référence: ' +
      streamId +
      '.';
    try {
      await sendWebSocketCommand({
        wsUrl: config.wsUrl,
        command: buildSimpleXSendCommand(config.chatRef, message),
        WebSocketImpl,
        timeoutMs,
      });
    } catch (error) {
      logger.warn('[SimpleX] Pending-action notification failed', error);
    }
  };
}

module.exports = {
  DEFAULT_WS_URL,
  buildSimpleXSendCommand,
  createSimpleXPendingActionNotifier,
  isLoopbackWebSocketUrl,
  resolveSimpleXConfig,
  sendWebSocketCommand,
};
