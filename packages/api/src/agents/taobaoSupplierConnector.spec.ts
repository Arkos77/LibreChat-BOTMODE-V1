import { TaobaoSupplierConnector } from './taobaoSupplierConnector';

describe('Taobao supplier connector', () => {
  const credentialProvider = {
    get: async () => ({ appKey: 'app-key-test', sign: 'signature-test' }),
  };

  it('maps a supplier response without upgrading verification', async () => {
    const connector = new TaobaoSupplierConnector({
      credentialProvider,
      now: () => new Date('2026-10-04T09:00:00.000Z'),
      fetchImpl: (async (
        _input: Parameters<typeof fetch>[0],
        init: Parameters<typeof fetch>[1],
      ) => {
        expect(init?.method).toBe('POST');
        const body = String(init?.body);
        expect(body).toContain('method=alibaba.pur.supplier.get');
        expect(body).toContain('app_key=app-key-test');
        expect(body).toContain('sign=signature-test');
        return new Response(
          JSON.stringify({
            supplier: {
              supplier_id: 'sup-1',
              supplier_name: 'Supplier One',
              company_name: 'Supplier One Ltd',
            },
          }),
          { status: 200 },
        );
      }) as unknown as typeof fetch,
    });

    await expect(connector.getSupplier({ supplierId: 'sup-1' })).resolves.toEqual({
      partyId: 'sup-1',
      name: 'Supplier One Ltd',
      kind: 'SUPPLIER',
      sourceRef: 'taobao:supplier:sup-1',
      verification: 'UNVERIFIED',
    });
  });

  it('fails closed when credentials are missing', async () => {
    const connector = new TaobaoSupplierConnector({
      credentialProvider: { get: async () => undefined },
      fetchImpl: (async () => new Response('', { status: 200 })) as unknown as typeof fetch,
    });
    await expect(connector.getSupplier({ supplierId: 'sup-1' })).rejects.toThrow(
      /credentials are unavailable/,
    );
  });

  it('fails closed on upstream errors', async () => {
    const connector = new TaobaoSupplierConnector({
      credentialProvider,
      fetchImpl: (async () => new Response('', { status: 401 })) as unknown as typeof fetch,
    });
    await expect(connector.getSupplier({ supplierId: 'sup-1' })).rejects.toThrow(
      'Taobao supplier HTTP 401',
    );
  });
});
