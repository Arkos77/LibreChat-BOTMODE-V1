import { discoverOpportunitySignals, normalizeOpportunityDiscoveryInput, validateOpportunitySourceAdapterDescriptor } from './opportunitySources';
import type { OpportunitySignal } from './opportunity';
import type { OpportunitySourceAdapter } from './opportunitySources';

const descriptor = {
  sourceId: 'source-test', name: 'Test source', categories: ['jobs'], access: 'PUBLIC_HTTP' as const,
  supportsIncremental: true, provenance: 'PUBLIC' as const, sourceUrl: 'https://example.com',
};

const signal: OpportunitySignal = {
  sourceId: 'source-test', title: 'Mission', category: 'jobs', geography: 'EUROPE', capturedAt: '2026-10-04T00:00:00.000Z',
  url: 'https://example.com/1', externalId: '1',
};

describe('opportunity source adapters', () => {
  it('validates a public source descriptor', () => expect(() => validateOpportunitySourceAdapterDescriptor(descriptor)).not.toThrow());
  it('normalizes bounded discovery input', () => {
    expect(normalizeOpportunityDiscoveryInput({ query: ' jobs ', since: '2026-10-03T00:00:00.000Z', limit: 5 })).toEqual({ query: 'jobs', since: '2026-10-03T00:00:00.000Z', limit: 5 });
  });
  it('rejects invalid limits and source URLs', () => {
    expect(() => normalizeOpportunityDiscoveryInput({ query: 'jobs', limit: 101 })).toThrow(/between 1 and 100/);
    expect(() => validateOpportunitySourceAdapterDescriptor({ ...descriptor, sourceUrl: 'bad' })).toThrow(/valid URL/);
  });
  it('discovers signals through an adapter without making authorization decisions', async () => {
    const adapter: OpportunitySourceAdapter = { descriptor, discover: jest.fn(async () => [signal]) };
    await expect(discoverOpportunitySignals(adapter, { query: 'jobs', limit: 1 })).resolves.toEqual([signal]);
    expect(adapter.discover).toHaveBeenCalledWith({ query: 'jobs', limit: 1 });
  });
});
