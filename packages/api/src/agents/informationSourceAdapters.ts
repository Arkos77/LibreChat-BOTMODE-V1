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
