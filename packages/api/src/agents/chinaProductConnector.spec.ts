import { TaobaoProductMarketConnector } from './chinaProductConnector';

describe('China product connector', () => {
  it('maps the public Taobao product-market response without inventing supplier verification', async () => {
    const connector = new TaobaoProductMarketConnector({
      fetchImpl: (async (
        _input: Parameters<typeof fetch>[0],
        init: Parameters<typeof fetch>[1],
      ) => {
        expect(init?.method).toBe('POST');
        const body = String(init?.body);
        expect(body).toContain('method=taobao.itemmarket.item.searching');
        expect(body).toContain('query_word=wireless+mouse');
        return new Response(
          JSON.stringify({
            items: [
              {
                num_iid: 123,
                title: 'Wireless Mouse',
                price: '19.90',
                pic_url: 'https://img.example/item.jpg',
                tag_list: 'DELIVERY_AGENT_ONE,QUALITY_STALL',
              },
            ],
          }),
          { status: 200 },
        );
      }) as unknown as typeof fetch,
    });

    await expect(connector.search({ query: 'wireless mouse', limit: 1 })).resolves.toEqual([
      {
        platform: 'TAOBAO',
        productId: '123',
        title: 'Wireless Mouse',
        unitPrice: 19.9,
        currency: 'CNY',
        url: 'https://img.example/item.jpg',
        tags: ['DELIVERY_AGENT_ONE', 'QUALITY_STALL'],
        evidenceRefs: ['taobao:item:123'],
        verification: 'UNVERIFIED',
      },
    ]);
  });

  it('fails closed on invalid limits and HTTP errors', async () => {
    const connector = new TaobaoProductMarketConnector({
      fetchImpl: (async () => new Response('', { status: 503 })) as unknown as typeof fetch,
    });
    await expect(connector.search({ query: 'mouse', limit: 0 })).rejects.toThrow(
      /between 1 and 20/,
    );
    await expect(connector.search({ query: 'mouse', limit: 1 })).rejects.toThrow('Taobao HTTP 503');
  });
});
