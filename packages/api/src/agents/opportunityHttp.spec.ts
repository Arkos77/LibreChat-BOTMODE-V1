import { OpportunityHttpAdapter } from './opportunityHttp';

describe('Opportunity HTTP adapter', () => {
  const descriptor = {
    sourceId: 'jobs-http',
    name: 'HTTP jobs source',
    categories: ['jobs'],
    access: 'PUBLIC_HTTP' as const,
    supportsIncremental: true,
    provenance: 'PUBLIC' as const,
    sourceUrl: 'https://example.com/jobs',
  };

  const signal = {
    sourceId: 'jobs-http',
    title: 'Remote opportunity',
    category: 'jobs',
    geography: 'EUROPE' as const,
    capturedAt: '2026-10-04T00:00:00.000Z',
    url: 'https://example.com/jobs/1',
    externalId: '1',
  };

  it('fetches through the bounded HTTP adapter and parses source signals', async () => {
    let request: { url: string; headers: HeadersInit | undefined } | undefined;
    const adapter = new OpportunityHttpAdapter({
      descriptor,
      endpoint: 'https://example.com/jobs',
      fetchImpl: (async (input, init) => {
        request = { url: String(input), headers: init?.headers };
        return new Response('payload', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        });
      }) as typeof fetch,
      parse: (body, responseUrl, capturedAt) => {
        expect(body).toBe('payload');
        expect(responseUrl).toBe('https://example.com/jobs?q=jobs&limit=2');
        expect(capturedAt).toBeTruthy();
        return [signal];
      },
    });

    await expect(adapter.discover({ query: ' jobs ', limit: 2 })).resolves.toEqual([signal]);
    expect(request?.url).toBe('https://example.com/jobs?q=jobs&limit=2');
    expect(request?.headers).toEqual(expect.objectContaining({
      accept: expect.stringContaining('application/rss+xml'),
      'user-agent': 'BOT-MODE-opportunity-reader/1.0',
    }));
  });

  it('fails closed on non-2xx sources', async () => {
    const adapter = new OpportunityHttpAdapter({
      descriptor,
      endpoint: 'https://example.com/jobs',
      fetchImpl: (async () => new Response('', { status: 403 })) as typeof fetch,
      parse: () => [signal],
    });
    await expect(adapter.discover({ query: 'jobs' })).rejects.toThrow('Opportunity source HTTP 403');
  });

  it('caps request timeout configuration', async () => {
    const adapter = new OpportunityHttpAdapter({
      descriptor,
      endpoint: 'https://example.com/jobs',
      timeoutMs: 999999,
      fetchImpl: (async () => new Response('', { status: 200 })) as typeof fetch,
      parse: () => [signal],
    });
    await expect(adapter.discover({ query: 'jobs', limit: 100 })).resolves.toEqual([signal]);
  });
});
