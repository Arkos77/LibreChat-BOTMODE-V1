import { RemotiveOpportunityAdapter } from './remotiveOpportunityAdapter';

describe('Remotive opportunity adapter', () => {
  it('maps the public Remotive JSON shape', async () => {
    const adapter = new RemotiveOpportunityAdapter({
      fetchImpl: (async (input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1]) => {
        expect(String(input)).toContain('search=engineer');
        expect(String(input)).toContain('limit=2');
        expect(init?.headers).toEqual(
          expect.objectContaining({
            accept: 'application/json',
            'user-agent': 'BOT-MODE-opportunity-reader/1.0',
          }),
        );
        return new Response(
          JSON.stringify({
            jobs: [
              {
                id: 2091132,
                url: 'https://remotive.com/remote-jobs/software-development/senior-back-end-engineer-2091132',
                title: 'Senior back-end Engineer',
                company_name: 'Lemon.io',
                category: 'Software Development',
                tags: ['golang', 'python'],
                publication_date: '2026-09-30T13:15:26',
                candidate_required_location: 'Europe, USA, UK',
              },
            ],
          }),
          { status: 200 },
        );
      }) as unknown as typeof fetch,
    });

    await expect(adapter.discover({ query: 'engineer', limit: 2 })).resolves.toEqual([
      {
        sourceId: 'remotive',
        title: 'Senior back-end Engineer — Lemon.io',
        category: 'Software Development',
        geography: 'EUROPE',
        capturedAt: '2026-09-30T13:15:26',
        url: 'https://remotive.com/remote-jobs/software-development/senior-back-end-engineer-2091132',
        externalId: '2091132',
      },
    ]);
  });

  it('fails closed on non-2xx responses', async () => {
    const adapter = new RemotiveOpportunityAdapter({
      fetchImpl: (async () => new Response('', { status: 429 })) as unknown as typeof fetch,
    });
    await expect(adapter.discover({ query: 'engineer' })).rejects.toThrow('Remotive HTTP 429');
  });
});
