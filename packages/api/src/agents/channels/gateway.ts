export type ChannelKind =
  | 'web'
  | 'jarvis'
  | 'telegram'
  | 'whatsapp'
  | 'discord'
  | 'slack'
  | 'email';
export type ChannelDirection = 'inbound' | 'outbound';

export interface ChannelMessageEnvelope {
  messageId: string;
  channel: ChannelKind;
  direction: ChannelDirection;
  senderId: string;
  conversationId: string;
  text?: string;
  attachments?: readonly { id: string; name?: string; mimeType?: string }[];
  receivedAt: string;
  idempotencyKey: string;
  metadata?: Readonly<Record<string, string>>;
}

export interface ChannelAdapter {
  readonly channel: ChannelKind;
  receive?(envelope: ChannelMessageEnvelope): Promise<void>;
  send?(envelope: ChannelMessageEnvelope): Promise<void>;
}

export interface ChannelGatewayPolicy {
  allowedChannels: readonly ChannelKind[];
  allowInbound(channel: ChannelKind, senderId: string): boolean;
  allowOutbound(channel: ChannelKind, recipientId: string): boolean;
}

function requireText(name: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '')
    throw new Error(`Channel ${name} is required`);
  return value.trim();
}

export function normalizeChannelEnvelope(input: ChannelMessageEnvelope): ChannelMessageEnvelope {
  const channel = requireText('channel', input.channel) as ChannelKind;
  const direction = requireText('direction', input.direction) as ChannelDirection;
  const messageId = requireText('messageId', input.messageId);
  const senderId = requireText('senderId', input.senderId);
  const conversationId = requireText('conversationId', input.conversationId);
  const receivedAt = requireText('receivedAt', input.receivedAt);
  const idempotencyKey = requireText('idempotencyKey', input.idempotencyKey);
  if (!Number.isFinite(Date.parse(receivedAt)))
    throw new Error('Channel receivedAt must be a valid date');
  if (direction === 'inbound' && input.text == null && (input.attachments?.length ?? 0) === 0) {
    throw new Error('Inbound channel message requires text or attachment');
  }
  return {
    ...input,
    channel,
    direction,
    messageId,
    senderId,
    conversationId,
    receivedAt,
    idempotencyKey,
    ...(input.text?.trim() ? { text: input.text.trim() } : {}),
    attachments: input.attachments ? [...input.attachments] : [],
  };
}

export class ChannelGateway {
  private readonly adapters = new Map<ChannelKind, ChannelAdapter>();
  private readonly seen = new Set<string>();

  constructor(private readonly policy: ChannelGatewayPolicy) {
    this.assertPolicy();
  }

  register(adapter: ChannelAdapter): void {
    if (!this.policy.allowedChannels.includes(adapter.channel)) {
      throw new Error(`Channel is not enabled by policy: ${adapter.channel}`);
    }
    if (this.adapters.has(adapter.channel))
      throw new Error(`Channel already registered: ${adapter.channel}`);
    this.adapters.set(adapter.channel, adapter);
  }

  async dispatchInbound(
    envelope: ChannelMessageEnvelope,
  ): Promise<'accepted' | 'duplicate' | 'rejected'> {
    const normalized = normalizeChannelEnvelope(envelope);
    if (normalized.direction !== 'inbound')
      throw new Error('Inbound dispatch requires an inbound envelope');
    if (!this.policy.allowInbound(normalized.channel, normalized.senderId)) return 'rejected';
    const key = `${normalized.channel}:${normalized.idempotencyKey}`;
    if (this.seen.has(key)) return 'duplicate';
    const adapter = this.adapters.get(normalized.channel);
    if (!adapter?.receive) throw new Error(`No inbound adapter registered: ${normalized.channel}`);
    await adapter.receive(normalized);
    this.seen.add(key);
    return 'accepted';
  }

  async dispatchOutbound(
    envelope: ChannelMessageEnvelope,
    recipientId: string,
  ): Promise<'accepted' | 'rejected'> {
    const normalized = normalizeChannelEnvelope(envelope);
    if (normalized.direction !== 'outbound')
      throw new Error('Outbound dispatch requires an outbound envelope');
    if (!this.policy.allowOutbound(normalized.channel, recipientId)) return 'rejected';
    const adapter = this.adapters.get(normalized.channel);
    if (!adapter?.send) throw new Error(`No outbound adapter registered: ${normalized.channel}`);
    await adapter.send(normalized);
    return 'accepted';
  }

  private assertPolicy(): void {
    if (this.policy.allowedChannels.length === 0)
      throw new Error('Channel gateway requires at least one enabled channel');
    if (new Set(this.policy.allowedChannels).size !== this.policy.allowedChannels.length)
      throw new Error('Channel gateway channels must be unique');
  }
}
