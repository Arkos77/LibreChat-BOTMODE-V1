import type { ChinaSourcingOffer, SourcingParty } from './chinaSourcing';

export interface TaobaoSupplierCredentialProvider {
  get(): Promise<{ appKey: string; sign: string } | undefined>;
}

export interface TaobaoSupplierLookupInput {
  supplierId: string | number;
  corpId?: string;
}

interface SupplierPayload {
  supplier_id?: number | string;
  supplier_name?: string;
  corp_id?: string;
  company_name?: string;
  [key: string]: unknown;
}

interface TaobaoSupplierResponse {
  supplier?: SupplierPayload;
  alibaba_pur_supplier_get_response?: {
    supplier?: SupplierPayload;
  };
  error_response?: { msg?: string };
}

export interface TaobaoSupplierConnectorOptions {
  endpoint?: string;
  credentialProvider: TaobaoSupplierCredentialProvider;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export class TaobaoSupplierConnector {
  readonly id = 'taobao-supplier';
  readonly platform = 'TAOBAO' as const;

  private readonly endpoint: URL;
  private readonly credentials: TaobaoSupplierCredentialProvider;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(options: TaobaoSupplierConnectorOptions) {
    this.endpoint = new URL(options.endpoint ?? 'https://eco.taobao.com/router/rest');
    this.credentials = options.credentialProvider;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  async getSupplier(input: TaobaoSupplierLookupInput): Promise<SourcingParty | undefined> {
    const supplierId = String(input.supplierId).trim();
    if (!supplierId) throw new Error('supplierId must be non-empty');

    const credentials = await this.credentials.get();
    if (!credentials?.appKey || !credentials.sign) {
      throw new Error('Taobao supplier credentials are unavailable');
    }

    const body = new URLSearchParams({
      app_key: credentials.appKey,
      format: 'json',
      method: 'alibaba.pur.supplier.get',
      sign_method: 'hmac',
      sign: credentials.sign,
      timestamp: this.now()
        .toISOString()
        .replace('T', ' ')
        .replace(/\.\d{3}Z$/, ''),
      v: '2.0',
      simplify: 'true',
      supplier_id: supplierId,
      ...(input.corpId ? { corp_id: input.corpId } : {}),
    });

    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body,
    });
    if (!response.ok) throw new Error(`Taobao supplier HTTP ${response.status}`);

    const payload = (await response.json()) as TaobaoSupplierResponse;
    if (payload.error_response?.msg)
      throw new Error(`Taobao supplier API: ${payload.error_response.msg}`);
    const supplier = payload.supplier ?? payload.alibaba_pur_supplier_get_response?.supplier;
    if (!supplier?.supplier_id || !supplier.supplier_name) return undefined;

    return {
      partyId: String(supplier.supplier_id),
      name: supplier.company_name || supplier.supplier_name,
      kind: 'SUPPLIER',
      sourceRef: `taobao:supplier:${String(supplier.supplier_id)}`,
      verification: 'UNVERIFIED',
    };
  }

  async buildOffer(input: {
    supplier: SourcingParty;
    productId: string;
    unitPrice: number;
    minimumOrderQuantity: number;
    evidenceRefs: readonly string[];
  }): Promise<ChinaSourcingOffer> {
    if (input.supplier.verification !== 'VERIFIED') {
      return {
        offerId: `taobao:${input.productId}:${input.supplier.partyId}`,
        productId: input.productId,
        supplier: input.supplier,
        currency: 'CNY',
        unitPrice: input.unitPrice,
        minimumOrderQuantity: input.minimumOrderQuantity,
        evidenceRefs: [...input.evidenceRefs, input.supplier.sourceRef],
      };
    }
    throw new Error('Verified supplier offer construction requires the governed verification path');
  }
}
