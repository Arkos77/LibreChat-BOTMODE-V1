import type { OpportunitySignal } from './opportunity';

export interface OpportunitySourceAdapterDescriptor {
  sourceId: string;
  name: string;
  categories: readonly string[];
  access: 'PUBLIC_HTTP' | 'USER_AUTHENTICATED' | 'PARTNER';
  supportsIncremental: boolean;
  provenance: 'PUBLIC' | 'USER' | 'PARTNER';
  sourceUrl?: string;
}

export interface OpportunitySourceAdapter {
  readonly descriptor: OpportunitySourceAdapterDescriptor;
  discover(input: { query: string; since?: string; limit?: number }): Promise<readonly OpportunitySignal[]>;
}

function requiredText(name: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} must be non-empty`);
  return value.trim();
}

function validDate(name: string, value: string): void {
  requiredText(name, value);
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${name} must be a valid date`);
}

export function validateOpportunitySourceAdapterDescriptor(descriptor: OpportunitySourceAdapterDescriptor): void {
  requiredText('sourceId', descriptor.sourceId);
  requiredText('name', descriptor.name);
  if (!descriptor.categories.length) throw new Error('source adapter categories are required');
  if (descriptor.sourceUrl) {
    try { new URL(descriptor.sourceUrl); } catch { throw new Error('sourceUrl must be a valid URL'); }
  }
}

export function normalizeOpportunityDiscoveryInput(input: { query: string; since?: string; limit?: number }): { query: string; since?: string; limit?: number } {
  const query = requiredText('query', input.query);
  if (input.since) validDate('since', input.since);
  if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100)) {
    throw new Error('limit must be an integer between 1 and 100');
  }
  return { query, ...(input.since ? { since: input.since } : {}), ...(input.limit !== undefined ? { limit: input.limit } : {}) };
}

/** Adapter contracts never authorize publication/application or mutate task state. */
export async function discoverOpportunitySignals(
  adapter: OpportunitySourceAdapter,
  input: { query: string; since?: string; limit?: number },
): Promise<readonly OpportunitySignal[]> {
  validateOpportunitySourceAdapterDescriptor(adapter.descriptor);
  return adapter.discover(normalizeOpportunityDiscoveryInput(input));
}
