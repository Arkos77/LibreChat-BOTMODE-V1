import type { OpportunitySignal } from './opportunity';
import type { OpportunitySourceAdapter, OpportunitySourceAdapterDescriptor } from './opportunitySources';
import { normalizeOpportunityDiscoveryInput } from './opportunitySources';

interface RemotiveJob {
  id: number | string;
  url: string;
  title: string;
  company_name?: string;
  category?: string;
  tags?: readonly string[];
  publication_date?: string;
  candidate_required_location?: string;
}

interface RemotiveResponse {
  jobs?: readonly RemotiveJob[];
}

export const REMOTIVE_OPPORTUNITY_DESCRIPTOR: OpportunitySourceAdapterDescriptor = {
  sourceId: 'remotive',
  name: 'Remotive Remote Jobs',
  categories: ['jobs', 'remote-jobs'],
  access: 'PUBLIC_HTTP',
  supportsIncremental: false,
  provenance: 'PUBLIC',
  sourceUrl: 'https://remotive.com/remote-jobs/api',
};

function geography(job: RemotiveJob): OpportunitySignal['geography'] {
  const location = (job.candidate_required_location ?? '').toLowerCase();
  if (location.includes('france')) return 'FRANCE';
  if (location.includes('europe') || location.includes('eu')) return 'EUROPE';
  if (location.includes('french') || location.includes('canada')) return 'FRANCOPHONE';
  return 'INTERNATIONAL';
}

export interface RemotiveOpportunityAdapterOptions {
  endpoint?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class RemotiveOpportunityAdapter implements OpportunitySourceAdapter {
  readonly descriptor: OpportunitySourceAdapterDescriptor = REMOTIVE_OPPORTUNITY_DESCRIPTOR;

  private readonly endpoint: URL;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: RemotiveOpportunityAdapterOptions = {}) {
    this.endpoint = new URL(options.endpoint ?? 'https://remotive.com/api/remote-jobs');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = Math.max(500, Math.min(options.timeoutMs ?? 15_000, 60_000));
  }

  async discover(input: { query: string; since?: string; limit?: number }): Promise<readonly OpportunitySignal[]> {
    const normalized = normalizeOpportunityDiscoveryInput(input);
    const url = new URL(this.endpoint);
    if (normalized.query) url.searchParams.set('search', normalized.query);
    if (normalized.limit !== undefined) url.searchParams.set('limit', String(normalized.limit));

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
      if (!response.ok) throw new Error(`Remotive HTTP ${response.status}`);

      const payload = (await response.json()) as RemotiveResponse;
      const jobs = payload.jobs ?? [];
      return jobs.slice(0, normalized.limit ?? 20).flatMap((job) => {
        if (job.id == null || !job.title || !job.url) return [];
        return [{
          sourceId: this.descriptor.sourceId,
          title: job.company_name ? `${job.title} — ${job.company_name}` : job.title,
          category: job.category ?? 'jobs',
          geography: geography(job),
          capturedAt:
            job.publication_date && Number.isFinite(Date.parse(job.publication_date))
              ? job.publication_date
              : new Date().toISOString(),
          url: job.url,
          externalId: String(job.id),
        }];
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
