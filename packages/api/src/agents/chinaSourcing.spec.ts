import {
  createChinaSourcingOpportunity,
  isVerifiedManufacturer,
  validateChinaSourcingOffer,
} from './chinaSourcing';
import type { ChinaSourcingOffer, SourcingParty } from './chinaSourcing';

const supplier: SourcingParty = {
  partyId: 'party-1',
  name: 'Example Supplier',
  kind: 'SUPPLIER',
  sourceRef: '1688:item-1',
  verification: 'CLAIMED',
};

const offer = (overrides: Partial<ChinaSourcingOffer> = {}): ChinaSourcingOffer => ({
  offerId: 'offer-1',
  productId: 'product-1',
  supplier,
  currency: 'USD',
  unitPrice: 8.5,
  minimumOrderQuantity: 100,
  incoterms: 'FOB',
  paymentTerms: '30% deposit / 70% balance',
  qualityControl: ['pre-shipment inspection'],
  leadTimeDays: 20,
  shippingNotes: ['sea freight quote required'],
  evidenceRefs: ['evidence:offer-1'],
  ...overrides,
});

describe('China sourcing contract', () => {
  it('validates bounded procurement offer fields', () => {
    expect(() => validateChinaSourcingOffer(offer())).not.toThrow();
  });

  it('requires a positive MOQ and non-negative price', () => {
    expect(() => validateChinaSourcingOffer(offer({ minimumOrderQuantity: 0 }))).toThrow(/minimumOrderQuantity/);
    expect(() => validateChinaSourcingOffer(offer({ unitPrice: -1 }))).toThrow(/unitPrice/);
  });

  it('builds a sourcing opportunity with at least one evidence-backed offer', () => {
    const opportunity = createChinaSourcingOpportunity({
      opportunityId: 'opp-cn-1',
      productId: 'product-1',
      title: 'Example sourcing mission',
      sourcePlatforms: ['1688', 'Taobao'],
      offers: [offer()],
      verification: 'CLAIMED',
      constraints: ['no counterfeit'],
      evidenceRefs: ['evidence:offer-1'],
    });
    expect(opportunity.offers).toHaveLength(1);
    expect(opportunity.sourcePlatforms).toEqual(['1688', 'Taobao']);
  });

  it('does not promote supplier claims to verified manufacturer truth', () => {
    expect(isVerifiedManufacturer(supplier)).toBe(false);
    expect(isVerifiedManufacturer({ ...supplier, kind: 'MANUFACTURER', verification: 'CLAIMED' })).toBe(false);
    expect(isVerifiedManufacturer({ ...supplier, kind: 'MANUFACTURER', verification: 'VERIFIED' })).toBe(true);
  });
});
