const {
  buildSimpleXSendCommand,
  createSimpleXPendingActionNotifier,
  isLoopbackWebSocketUrl,
  resolveSimpleXConfig,
} = require('./simplex');

class FakeWebSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.sent = [];
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => this.onopen?.());
  }

  addEventListener(type, handler) {
    if (type === 'open') this.onopen = handler;
    if (type === 'error') this.onerror = handler;
  }

  send(payload) {
    this.sent.push(payload);
  }

  close() {}
}

describe('SimpleX BOT MODE notifier', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
  });

  it('is disabled until an explicit chat reference is configured', () => {
    expect(resolveSimpleXConfig({})).toEqual({ enabled: false });
    expect(createSimpleXPendingActionNotifier({ env: {} })).toBeUndefined();
  });

  it('accepts loopback ws endpoints and rejects public/unsecured hosts', () => {
    expect(isLoopbackWebSocketUrl('ws://127.0.0.1:5225')).toBe(true);
    expect(isLoopbackWebSocketUrl('ws://localhost:5225')).toBe(true);
    expect(isLoopbackWebSocketUrl('ws://192.168.1.2:5225')).toBe(false);
    expect(isLoopbackWebSocketUrl('wss://example.com')).toBe(false);
    expect(() =>
      resolveSimpleXConfig({
        SIMPLEX_BOT_CHAT_REF: '@1',
        SIMPLEX_BOT_WS_URL: 'ws://192.168.1.2:5225',
      }),
    ).toThrow(/localhost\/loopback/);
  });

  it('builds the official JSON send command envelope', () => {
    const command = buildSimpleXSendCommand('@2', 'Validation requise');
    expect(command).toContain('/_send @2 json ');
    expect(command).toContain('"msgContent":{"type":"text","text":"Validation requise"}');
  });

  it('sends a minimal pending-action notification without prompt content', async () => {
    const notifier = createSimpleXPendingActionNotifier({
      env: {
        SIMPLEX_BOT_CHAT_REF: '@2',
        SIMPLEX_BOT_WS_URL: 'ws://127.0.0.1:5225',
      },
      WebSocketImpl: FakeWebSocket,
    });

    await notifier('conversation-1', {
      pendingAction: {
        actionId: 'action-1',
        type: 'tool_approval',
        prompt: 'PRIVATE-SENTINEL',
      },
    });

    expect(FakeWebSocket.instances).toHaveLength(1);
    const envelope = JSON.parse(FakeWebSocket.instances[0].sent[0]);
    expect(envelope.corrId).toEqual(expect.any(String));
    expect(envelope.cmd).toContain('BOT MODE attend une validation');
    expect(envelope.cmd).toContain('conversation-1');
    expect(envelope.cmd).not.toContain('PRIVATE-SENTINEL');
  });
});
