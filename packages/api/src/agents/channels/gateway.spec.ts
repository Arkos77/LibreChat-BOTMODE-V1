import { ChannelGateway, type ChannelMessageEnvelope, normalizeChannelEnvelope } from './gateway';

const envelope = (overrides: Partial<ChannelMessageEnvelope> = {}): ChannelMessageEnvelope => ({
  messageId: 'm1',
  channel: 'telegram',
  direction: 'inbound',
  senderId: 'u1',
  conversationId: 'c1',
  text: ' hello ',
  receivedAt: '2026-10-05T10:00:00.000Z',
  idempotencyKey: 'k1',
  ...overrides,
});

describe('ChannelGateway', () => {
  it('normalizes inbound envelopes and copies attachments', () => {
    const normalized = normalizeChannelEnvelope(
      envelope({ attachments: [{ id: 'a1', name: 'x.pdf' }] }),
    );
    expect(normalized.text).toBe('hello');
    expect(normalized.attachments).toEqual([{ id: 'a1', name: 'x.pdf' }]);
  });

  it('enforces policy and de-duplicates inbound delivery', async () => {
    const receive = jest.fn();
    const gateway = new ChannelGateway({
      allowedChannels: ['telegram'],
      allowInbound: (channel, sender) => channel === 'telegram' && sender === 'u1',
      allowOutbound: () => true,
    });
    gateway.register({ channel: 'telegram', receive });
    expect(await gateway.dispatchInbound(envelope())).toBe('accepted');
    expect(await gateway.dispatchInbound(envelope())).toBe('duplicate');
    expect(receive).toHaveBeenCalledTimes(1);
    expect(
      await gateway.dispatchInbound(envelope({ senderId: 'blocked', idempotencyKey: 'k2' })),
    ).toBe('rejected');
  });

  it('rejects unregistered or disallowed channels before delivery', async () => {
    const gateway = new ChannelGateway({
      allowedChannels: ['web'],
      allowInbound: () => true,
      allowOutbound: () => true,
    });
    await expect(gateway.dispatchInbound(envelope({ channel: 'telegram' }))).rejects.toThrow(
      'No inbound adapter registered: telegram',
    );
  });
});
