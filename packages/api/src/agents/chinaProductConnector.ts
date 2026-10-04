export interface ChinaProductCandidate {
  platform: 'TAOBAO' | '1688';
  productId: string;
  title: string;
  currency?: string;
  unitPrice?: number;
  url?: string;
  tags: readonly string[];
  evidenceRefs: readonly string[];
  verification: 'UNVERIFIED' | 'CLAIMED';
}

export interface ChinaProductConnector {
  readonly id: string;
  readonly platform: ChinaProductCandidate['platform'];
  readonly requiresAuthorization: boolean;
  search(input: { query: string; limit?: number }): Promise<readonly ChinaProductCandidate[]>;
}

function requiredText(name: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '')
    throw new Error(`${name} must be non-empty`);
  return value.trim();
}

export interface TaobaoProductMarketConnectorOptions {
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

interface TaobaoResponse {
  items?: Array<{
    num_iid?: number | string;
    title?: string;
    price?: number | string;
    pic_url?: string;
    tag_list?: string | string[];
  }>;
}

export class TaobaoProductMarketConnector implements ChinaProductConnector {
  readonly id = 'taobao-product-market';
  readonly platform = 'TAOBAO' as const;
  readonly requiresAuthorization = false;

  private readonly endpoint: URL;
  private readonly fetchImpl: typeof fetch;

  constructor(options: TaobaoProductMarketConnectorOptions = {}) {
    this.endpoint = new URL(options.endpoint ?? 'https://eco.taobao.com/router/rest');
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async search(input: {
    query: string;
    limit?: number;
  }): Promise<readonly ChinaProductCandidate[]> {
    const query = requiredText('query', input.query);
    const limit = input.limit ?? 10;
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
      throw new Error('limit must be an integer between 1 and 20');
    }

    const body = new URLSearchParams({
      format: 'json',
      method: 'taobao.itemmarket.item.searching',
      v: '2.0',
      query_word: query,
      current_page: '1',
      page_size: String(limit),
      simplify: 'true',
    });

    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body,
    });
    if (!response.ok) throw new Error(`Taobao HTTP ${response.status}`);

    const payload = (await response.json()) as TaobaoResponse;
    return (payload.items ?? []).slice(0, limit).flatMap((item) => {
      if (item.num_iid == null || !item.title) return [];
      const price = item.price == null ? undefined : Number(item.price);
      return [
        {
          platform: 'TAOBAO' as const,
          productId: String(item.num_iid),
          title: item.title,
          ...(Number.isFinite(price) ? { unitPrice: price, currency: 'CNY' } : {}),
          ...(item.pic_url ? { url: item.pic_url } : {}),
          tags:
            typeof item.tag_list === 'string'
              ? item.tag_list
                  .split(',')
                  .map((tag) => tag.trim())
                  .filter(Boolean)
              : [...(item.tag_list ?? [])],
          evidenceRefs: [`taobao:item:${String(item.num_iid)}`],
          verification: 'UNVERIFIED' as const,
        },
      ];
    });
  }
}
