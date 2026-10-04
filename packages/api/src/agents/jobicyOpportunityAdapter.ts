import type { OpportunitySignal } from './opportunity';
import type { OpportunitySourceAdapter, OpportunitySourceAdapterDescriptor } from './opportunitySources';
import { normalizeOpportunityDiscoveryInput } from './opportunitySources';

interface JobicyJob {
  id: number | string;
  url: string;
  jobTitle: string;
  companyName?: string;
  jobIndustry?: readonly string[];
  jobGeo?: string;
  jobType?: readonly string[];
  pubDate?: string;
}

interface JobicyResponse {
  jobs?: readonly JobicyJob[];
}

export interface JobicyOpportunityAdapterOptions {
  endpoint?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export const JOBICY_OPPORTUNITY_DESCRIPTOR: OpportunitySourceAdapterDescriptor = {
  sourceId: 'jobicy',
  name: 'Jobicy Remote Jobs',
  categories: ['jobs', 'remote-jobs'],
  access: 'PUBLIC_HTTP',
  supportsIncremental: false,
  provenance: 'PUBLIC',
  sourceUrl: 'https://jobicy.com/jobs-rss-feed',
};

const EUROPE_GEOS = ['austria', 'belgium', 'bulgaria', 'croatia', 'cyprus', 'czech', 'denmark', 'estonia', 'finland', 'france', 'germany', 'greece', 'hungary', 'ireland', 'italy', 'latvia', 'lithuania', 'luxembourg', 'malta', 'netherlands', 'poland', 'portugal', 'romania', 'slovakia', 'slovenia', 'spain', 'sweden', 'uk', 'united kingdom', 'europe'];

const geography = (value: string | undefined): OpportunitySignal['geography'] => {
  const geo = (value ?? '').toLowerCase();
  if (geo.includes('france')) return 'FRANCE';
  if (EUROPE_GEOS.some((entry) => geo.includes(entry))) return 'EUROPE';
  if (geo.includes('canada') || geo.includes('french')) return 'FRANCOPHONE';
  return 'INTERNATIONAL';
};

export class JobicyOpportunityAdapter implements OpportunitySourceAdapter {
  readonly descriptor: OpportunitySourceAdapterDescriptor = JOBICY_OPPORTUNITY_DESCRIPTOR;

  private readonly endpoint: URL;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: JobicyOpportunityAdapterOptions = {}) {
    this.endpoint = new URL(options.endpoint ?? 'https://jobicy.com/api/v2/remote-jobs');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = Math.max(500, Math.min(options.timeoutMs ?? 15_000, 60_000));
  }

  async discover(input: { query: string; since?: string; limit?: number }): Promise<readonly OpportunitySignal[]> {
    const normalized = normalizeOpportunityDiscoveryInput(input);
    const url = new URL(this.endpoint);
    url.searchParams.set('count', String(normalized.limit ?? 20));
    url.searchParams.set('geo', 'europe');
    if (normalized.query.length >= 3) url.searchParams.set('tag', normalized.query);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        headers: {
          accept: 'application/json',
          'user-agent': 'BOT-MODE-opportunity-reader/1.0',
        },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Jobicy HTTP ${response.status}`);
      const payload = (await response.json()) as JobicyResponse;
      const jobs = payload.jobs ?? [];
      const capturedAt = new Date().toISOString();
      return jobs.slice(0, normalized.limit ?? 20).map((job) => ({
        sourceId: this.descriptor.sourceId,
        title: job.companyName ? `${job.jobTitle} — ${job.companyName}` : job.jobTitle,
        category: 'jobs',
        geography: geography(job.jobGeo),
        capturedAt: job.pubDate && Number.isFinite(Date.parse(job.pubDate)) ? job.pubDate : capturedAt,
        url: job.url,
        externalId: String(job.id),
      }));
    } finally {
      clearTimeout(timer);
    }
  }
}
