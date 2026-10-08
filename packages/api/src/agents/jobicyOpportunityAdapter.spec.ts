import { JobicyOpportunityAdapter } from './jobicyOpportunityAdapter';

describe('Jobicy opportunity adapter', () => {
  it('maps the live Jobicy JSON shape into bounded OpportunitySignals', async () => {
    const payload = {
      jobs: [
        {
          id: 154396,
          url: 'https://jobicy.com/jobs/154396-sr-software-engineer',
          jobTitle: 'Sr. Software Engineer',
          companyName: 'Samsara',
          jobIndustry: ['Software Engineering'],
          jobGeo: 'Poland',
          pubDate: '2026-10-04T04:00:00+00:00',
        },
      ],
    };
    const adapter = new JobicyOpportunityAdapter({
      fetchImpl: (async () =>
        new Response(JSON.stringify(payload), { status: 200 })) as unknown as typeof fetch,
    });
    await expect(adapter.discover({ query: 'engineer', limit: 1 })).resolves.toEqual([
      {
        sourceId: 'jobicy',
        title: 'Sr. Software Engineer — Samsara',
        category: 'jobs',
        geography: 'EUROPE',
        capturedAt: '2026-10-04T04:00:00+00:00',
        url: 'https://jobicy.com/jobs/154396-sr-software-engineer',
        externalId: '154396',
      },
    ]);
  });

  it('maps Europe explicitly and rejects non-2xx responses', async () => {
    const adapter = new JobicyOpportunityAdapter({
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            jobs: [
              { id: 1, url: 'https://jobicy.com/jobs/1', jobTitle: 'Engineer', jobGeo: 'Europe' },
            ],
          }),
          { status: 200 },
        )) as unknown as typeof fetch,
    });
    await expect(adapter.discover({ query: 'eng' })).resolves.toMatchObject([
      { geography: 'EUROPE', externalId: '1' },
    ]);

    const failing = new JobicyOpportunityAdapter({
      fetchImpl: (async () => new Response('', { status: 429 })) as unknown as typeof fetch,
    });
    await expect(failing.discover({ query: 'eng' })).rejects.toThrow('Jobicy HTTP 429');
  });
});
