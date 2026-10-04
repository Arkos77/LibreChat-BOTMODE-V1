import {
  FMHY_INFORMATION_SOURCE,
  RssInformationWatchAdapter,
  YouTubeInformationWatchAdapter,
  YOUTUBE_INFORMATION_SOURCE,
  TGStatInformationWatchAdapter,
  TGSTAT_INFORMATION_SOURCE,
  RedditInformationWatchAdapter,
  REDDIT_INFORMATION_SOURCE,
} from './informationSourceAdapters';

describe('information source adapters', () => {
  it('reads RSS and reports an active source with item count', async () => {
    const adapter = new RssInformationWatchAdapter({
      descriptor: FMHY_INFORMATION_SOURCE,
      feedUrl: 'https://example.com/feed.xml',
      fetchImpl: (async () =>
        new Response('<rss><channel><item/><item/></channel></rss>', {
          status: 200,
        })) as typeof fetch,
    });
    await expect(adapter.check()).resolves.toMatchObject({
      sourceId: 'fmhy',
      status: 'ACTIVE',
      itemCount: 2,
    });
  });

  it('fails closed on RSS HTTP failures', async () => {
    const adapter = new RssInformationWatchAdapter({
      descriptor: FMHY_INFORMATION_SOURCE,
      feedUrl: 'https://example.com/feed.xml',
      fetchImpl: (async () => new Response('', { status: 503 })) as typeof fetch,
    });
    await expect(adapter.check()).rejects.toThrow('HTTP 503');
  });

  it('marks YouTube disconnected when its API key is absent', async () => {
    const adapter = new YouTubeInformationWatchAdapter({ query: 'AI France' });
    await expect(adapter.check()).resolves.toMatchObject({
      sourceId: YOUTUBE_INFORMATION_SOURCE.sourceId,
      status: 'DISCONNECTED',
    });
  });

  it('maps YouTube authenticated search results to an active watch state', async () => {
    const adapter = new YouTubeInformationWatchAdapter({
      apiKey: 'test-key',
      query: 'BOT MODE',
      fetchImpl: (async (input) => {
        expect(String(input)).toContain('q=BOT+MODE');
        return new Response(JSON.stringify({ items: [{ id: 1 }, { id: 2 }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }) as typeof fetch,
    });
    await expect(adapter.check()).resolves.toMatchObject({
      sourceId: 'youtube',
      status: 'ACTIVE',
      itemCount: 2,
    });
  });
  it('marks TGStat disconnected when its API token is absent', async () => {
    const adapter = new TGStatInformationWatchAdapter({ query: 'BOT MODE' });
    await expect(adapter.check()).resolves.toMatchObject({
      sourceId: TGSTAT_INFORMATION_SOURCE.sourceId,
      status: 'DISCONNECTED',
    });
  });

  it('reads TGStat publication search results with a token', async () => {
    const adapter = new TGStatInformationWatchAdapter({
      token: 'test-token',
      query: 'BOT MODE',
      limit: 10,
      fetchImpl: (async (input) => {
        expect(String(input)).toContain('q=BOT+MODE');
        expect(String(input)).toContain('limit=10');
        return new Response(JSON.stringify({ status: 'ok', response: { count: 7, items: [{}] } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }) as typeof fetch,
    });
    await expect(adapter.check()).resolves.toMatchObject({
      sourceId: 'tgstat',
      status: 'ACTIVE',
      itemCount: 7,
    });
  });
  it('marks Reddit disconnected without OAuth instead of scraping the site', async () => {
    const adapter = new RedditInformationWatchAdapter({ query: 'BOT MODE' });
    await expect(adapter.check()).resolves.toMatchObject({
      sourceId: REDDIT_INFORMATION_SOURCE.sourceId,
      status: 'DISCONNECTED',
    });
  });

  it('uses Reddit OAuth API search when a token is present', async () => {
    const adapter = new RedditInformationWatchAdapter({
      accessToken: 'test-token',
      query: 'BOT MODE',
      subreddit: 'opensource',
      limit: 10,
      fetchImpl: (async (input, init) => {
        const url = String(input);
        expect(url).toContain('/r/opensource/search');
        expect(url).toContain('q=BOT+MODE');
        expect(init?.headers).toEqual(
          expect.objectContaining({
            authorization: 'Bearer test-token',
          }),
        );
        return new Response(JSON.stringify({ data: { children: [{}, {}] } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }) as typeof fetch,
    });
    await expect(adapter.check()).resolves.toMatchObject({
      sourceId: 'reddit',
      status: 'ACTIVE',
      itemCount: 2,
    });
  });
});
