import type { OpportunitySignal } from './opportunity';
import {
  discoverOpportunitySignals,
  type OpportunitySourceAdapter,
  type OpportunitySourceAdapterDescriptor,
} from './opportunitySources';

export interface OpportunityHttpAdapterOptions {
  descriptor: OpportunitySourceAdapterDescriptor;
  endpoint: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  headers?: Readonly<Record<string, string>>;
  parse: (body: string, responseUrl: string, capturedAt: string) => readonly OpportunitySignal[];
}

function validEndpoint(endpoint: string): URL {
  const url = new URL(endpoint);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Opportunity HTTP endpoint must use HTTP(S)');
  }
  return url;
}

export class OpportunityHttpAdapter implements OpportunitySourceAdapter {
  readonly descriptor: OpportunitySourceAdapterDescriptor;

  private readonly endpoint: URL;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly headers: Readonly<Record<string, string>>;
  private readonly parse: OpportunityHttpAdapterOptions['parse'];

  constructor(options: OpportunityHttpAdapterOptions) {
    this.descriptor = options.descriptor;
    this.endpoint = validEndpoint(options.endpoint);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = Math.max(500, Math.min(options.timeoutMs ?? 15_000, 60_000));
    this.headers = {
      accept: 'application/rss+xml, application/atom+xml, application/json, text/html;q=0.9, */*;q=0.8',
      'user-agent': 'BOT-MODE-opportunity-reader/1.0',
      ...(options.headers ?? {}),
    };
    this.parse = options.parse;
  }

  async discover(input: { query: string; since?: string; limit?: number }): Promise<readonly OpportunitySignal[]> {
    const normalized = await discoverOpportunitySignals(
      {
        descriptor: this.descriptor,
        discover: async (query) => {
          const url = new URL(this.endpoint);
          url.searchParams.set('q', query.query);
          if (query.since) url.searchParams.set('since', query.since);
          if (query.limit !== undefined) url.searchParams.set('limit', String(query.limit));

          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), this.timeoutMs);
          try {
            const response = await this.fetchImpl(url, { headers: this.headers, signal: controller.signal });
            if (!response.ok) throw new Error(`Opportunity source HTTP ${response.status}`);
            const body = await response.text();
            const capturedAt = new Date().toISOString();
            return this.parse(body, response.url || url.toString(), capturedAt);
          } finally {
            clearTimeout(timer);
          }
        },
      },
      input,
    );
    return normalized;
  }
}
