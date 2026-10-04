import type {
  InformationSourceDescriptor,
  InformationSourceObservation,
  InformationWatchAdapter,
} from './informationWatch';

function parseXmlItemCount(body: string): number {
  return (body.match(/<(item|entry)\b/g) ?? []).length;
}

function validHttpUrl(value: string): URL {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('Information source URL must use HTTP(S)');
  return url;
}

export interface RssInformationWatchAdapterOptions {
  descriptor: InformationSourceDescriptor;
  feedUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class RssInformationWatchAdapter implements InformationWatchAdapter {
  readonly descriptor: InformationSourceDescriptor;
  private readonly feedUrl: URL;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: RssInformationWatchAdapterOptions) {
    this.descriptor = options.descriptor;
    this.feedUrl = validHttpUrl(options.feedUrl);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = Math.max(500, Math.min(options.timeoutMs ?? 15_000, 60_000));
  }

  async check(): Promise<InformationSourceObservation> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.feedUrl, {
        headers: {
          accept:
            'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
          'user-agent': 'BOT-MODE-information-watch/1.0',
        },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Information source HTTP ${response.status}`);
      const body = await response.text();
      return {
        sourceId: this.descriptor.sourceId,
        checkedAt: new Date().toISOString(),
        status: 'ACTIVE',
        sourceRef: `rss:${this.feedUrl.toString()}`,
        itemCount: parseXmlItemCount(body),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export const FMHY_RSS_FEED_URL = 'https://d.fmhy.bid/rss.xml';

export const FMHY_INFORMATION_SOURCE: InformationSourceDescriptor = {
  sourceId: 'fmhy',
  name: 'FMHY',
  category: 'web',
  access: 'PUBLIC_HTTP',
  connected: true,
  sourceUrl: 'https://fmhy.net',
};

export interface YouTubeInformationWatchAdapterOptions {
  apiKey?: string;
  query: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  regionCode?: string;
  relevanceLanguage?: string;
}

export const YOUTUBE_INFORMATION_SOURCE: InformationSourceDescriptor = {
  sourceId: 'youtube',
  name: 'YouTube',
  category: 'video',
  access: 'USER_AUTHENTICATED',
  connected: false,
  sourceUrl: 'https://www.youtube.com',
};

export class YouTubeInformationWatchAdapter implements InformationWatchAdapter {
  readonly descriptor = YOUTUBE_INFORMATION_SOURCE;
  private readonly apiKey?: string;
  private readonly query: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly regionCode: string;
  private readonly relevanceLanguage: string;

  constructor(options: YouTubeInformationWatchAdapterOptions) {
    if (!options.query.trim()) throw new Error('YouTube watch query is required');
    this.apiKey = options.apiKey?.trim() || undefined;
    this.query = options.query.trim();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = Math.max(500, Math.min(options.timeoutMs ?? 15_000, 60_000));
    this.regionCode = options.regionCode ?? 'FR';
    this.relevanceLanguage = options.relevanceLanguage ?? 'fr';
  }

  async check(): Promise<InformationSourceObservation> {
    if (!this.apiKey) {
      return {
        sourceId: this.descriptor.sourceId,
        checkedAt: new Date().toISOString(),
        status: 'DISCONNECTED',
        sourceRef: 'youtube:api-key-required',
        note: 'YouTube Data API key is required for this watch adapter',
      };
    }

    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('type', 'video');
    url.searchParams.set('maxResults', '25');
    url.searchParams.set('q', this.query);
    url.searchParams.set('order', 'date');
    url.searchParams.set('regionCode', this.regionCode);
    url.searchParams.set('relevanceLanguage', this.relevanceLanguage);
    url.searchParams.set('key', this.apiKey);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        headers: { accept: 'application/json', 'user-agent': 'BOT-MODE-information-watch/1.0' },
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) {
        return {
          sourceId: this.descriptor.sourceId,
          checkedAt: new Date().toISOString(),
          status: 'UNAVAILABLE',
          sourceRef: 'youtube:data-api',
          note: `YouTube Data API authentication/quota failure (${response.status})`,
        };
      }
      if (!response.ok) throw new Error(`YouTube Data API HTTP ${response.status}`);
      const payload = (await response.json()) as { items?: unknown[] };
      return {
        sourceId: this.descriptor.sourceId,
        checkedAt: new Date().toISOString(),
        status: 'ACTIVE',
        sourceRef: 'youtube:data-api',
        itemCount: payload.items?.length ?? 0,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export const TGSTAT_INFORMATION_SOURCE: InformationSourceDescriptor = {
  sourceId: 'tgstat',
  name: 'TGStat',
  category: 'specialized',
  access: 'USER_AUTHENTICATED',
  connected: false,
  sourceUrl: 'https://tgstat.com',
};

export interface TGStatInformationWatchAdapterOptions {
  token?: string;
  query: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  limit?: number;
}

export class TGStatInformationWatchAdapter implements InformationWatchAdapter {
  readonly descriptor = TGSTAT_INFORMATION_SOURCE;
  private readonly token?: string;
  private readonly query: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly limit: number;

  constructor(options: TGStatInformationWatchAdapterOptions) {
    if (!options.query.trim()) throw new Error('TGStat watch query is required');
    this.token = options.token?.trim() || undefined;
    this.query = options.query.trim();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = Math.max(500, Math.min(options.timeoutMs ?? 15_000, 60_000));
    this.limit = Math.max(1, Math.min(options.limit ?? 20, 50));
  }

  async check(): Promise<InformationSourceObservation> {
    if (!this.token) {
      return {
        sourceId: this.descriptor.sourceId,
        checkedAt: new Date().toISOString(),
        status: 'DISCONNECTED',
        sourceRef: 'tgstat:api-token-required',
        note: 'TGStat API token is required for publication search',
      };
    }

    const url = new URL('https://api.tgstat.ru/posts/search');
    url.searchParams.set('token', this.token);
    url.searchParams.set('q', this.query);
    url.searchParams.set('limit', String(this.limit));
    url.searchParams.set('hideDeleted', '1');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        headers: { accept: 'application/json', 'user-agent': 'BOT-MODE-information-watch/1.0' },
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) {
        return {
          sourceId: this.descriptor.sourceId,
          checkedAt: new Date().toISOString(),
          status: 'UNAVAILABLE',
          sourceRef: 'tgstat:api-search',
          note: `TGStat authentication/quota failure (${response.status})`,
        };
      }
      if (!response.ok) throw new Error(`TGStat API HTTP ${response.status}`);
      const payload = (await response.json()) as {
        status?: string;
        response?: { items?: unknown[]; count?: number };
      };
      if (payload.status !== 'ok') {
        return {
          sourceId: this.descriptor.sourceId,
          checkedAt: new Date().toISOString(),
          status: 'UNAVAILABLE',
          sourceRef: 'tgstat:api-search',
          note: 'TGStat returned a non-ok API status',
        };
      }
      return {
        sourceId: this.descriptor.sourceId,
        checkedAt: new Date().toISOString(),
        status: 'ACTIVE',
        sourceRef: 'tgstat:api-search',
        itemCount: payload.response?.count ?? payload.response?.items?.length ?? 0,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export const REDDIT_INFORMATION_SOURCE: InformationSourceDescriptor = {
  sourceId: 'reddit',
  name: 'Reddit',
  category: 'social',
  access: 'USER_AUTHENTICATED',
  connected: false,
  sourceUrl: 'https://www.reddit.com',
};

export interface RedditInformationWatchAdapterOptions {
  accessToken?: string;
  query: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  subreddit?: string;
  limit?: number;
}

export class RedditInformationWatchAdapter implements InformationWatchAdapter {
  readonly descriptor = REDDIT_INFORMATION_SOURCE;
  private readonly accessToken?: string;
  private readonly query: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly subreddit?: string;
  private readonly limit: number;

  constructor(options: RedditInformationWatchAdapterOptions) {
    if (!options.query.trim()) throw new Error('Reddit watch query is required');
    this.accessToken = options.accessToken?.trim() || undefined;
    this.query = options.query.trim();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = Math.max(500, Math.min(options.timeoutMs ?? 15_000, 60_000));
    this.subreddit = options.subreddit?.trim() || undefined;
    this.limit = Math.max(1, Math.min(options.limit ?? 25, 100));
  }

  async check(): Promise<InformationSourceObservation> {
    if (!this.accessToken) {
      return {
        sourceId: this.descriptor.sourceId,
        checkedAt: new Date().toISOString(),
        status: 'DISCONNECTED',
        sourceRef: 'reddit:oauth-required',
        note: 'Reddit OAuth access token is required; direct site scraping is not used',
      };
    }

    const url = new URL(
      `https://oauth.reddit.com${this.subreddit ? `/r/${encodeURIComponent(this.subreddit)}/search` : '/search'}`,
    );
    url.searchParams.set('q', this.query);
    url.searchParams.set('sort', 'new');
    url.searchParams.set('limit', String(this.limit));
    url.searchParams.set('restrict_sr', this.subreddit ? 'on' : 'off');
    url.searchParams.set('raw_json', '1');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${this.accessToken}`,
          'user-agent': 'BOT-MODE-information-watch/1.0',
        },
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) {
        return {
          sourceId: this.descriptor.sourceId,
          checkedAt: new Date().toISOString(),
          status: 'UNAVAILABLE',
          sourceRef: 'reddit:oauth-api',
          note: `Reddit authentication or policy failure (${response.status})`,
        };
      }
      if (!response.ok) throw new Error(`Reddit API HTTP ${response.status}`);
      const payload = (await response.json()) as { data?: { children?: unknown[] } };
      return {
        sourceId: this.descriptor.sourceId,
        checkedAt: new Date().toISOString(),
        status: 'ACTIVE',
        sourceRef: 'reddit:oauth-api',
        itemCount: payload.data?.children?.length ?? 0,
        note: 'Using OAuth/API path; monitor Reddit developer-platform migration status',
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export const DISCORD_INFORMATION_SOURCE: InformationSourceDescriptor = {
  sourceId: 'discord',
  name: 'Discord',
  category: 'community',
  access: 'USER_AUTHENTICATED',
  connected: false,
  sourceUrl: 'https://discord.com',
};

export interface DiscordInformationWatchAdapterOptions {
  botToken?: string;
  channelId: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  limit?: number;
  requireMessageContent?: boolean;
}

export class DiscordInformationWatchAdapter implements InformationWatchAdapter {
  readonly descriptor = DISCORD_INFORMATION_SOURCE;
  private readonly botToken?: string;
  private readonly channelId: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly limit: number;
  private readonly requireMessageContent: boolean;

  constructor(options: DiscordInformationWatchAdapterOptions) {
    if (!/^\d{15,25}$/.test(options.channelId))
      throw new Error('Discord channelId must be a Discord snowflake');
    this.botToken = options.botToken?.trim() || undefined;
    this.channelId = options.channelId;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = Math.max(500, Math.min(options.timeoutMs ?? 15_000, 60_000));
    this.limit = Math.max(1, Math.min(options.limit ?? 25, 100));
    this.requireMessageContent = options.requireMessageContent ?? true;
  }

  async check(): Promise<InformationSourceObservation> {
    if (!this.botToken) {
      return {
        sourceId: this.descriptor.sourceId,
        checkedAt: new Date().toISOString(),
        status: 'DISCONNECTED',
        sourceRef: 'discord:bot-token-required',
        note: 'A Discord bot token is required; normal user account automation is not supported',
      };
    }

    const url = new URL(`https://discord.com/api/v10/channels/${this.channelId}/messages`);
    url.searchParams.set('limit', String(this.limit));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        headers: {
          accept: 'application/json',
          authorization: `Bot ${this.botToken}`,
          'user-agent': 'BOT-MODE-information-watch/1.0',
        },
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) {
        return {
          sourceId: this.descriptor.sourceId,
          checkedAt: new Date().toISOString(),
          status: 'UNAVAILABLE',
          sourceRef: 'discord:bot-api',
          note: `Discord bot authorization/channel permission failure (${response.status})`,
        };
      }
      if (!response.ok) throw new Error(`Discord API HTTP ${response.status}`);
      const payload = (await response.json()) as Array<Record<string, unknown>>;
      return {
        sourceId: this.descriptor.sourceId,
        checkedAt: new Date().toISOString(),
        status: 'ACTIVE',
        sourceRef: 'discord:bot-api',
        itemCount: payload.length,
        note: this.requireMessageContent
          ? 'Message content analysis requires Discord MESSAGE_CONTENT privileged intent when applicable'
          : 'Metadata-only watch; no message content parsing requested',
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
