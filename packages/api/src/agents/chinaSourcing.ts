export type SourcingPartyKind = 'SELLER' | 'SUPPLIER' | 'FACTORY' | 'AGENT' | 'MANUFACTURER';
export type SourcingVerification = 'UNVERIFIED' | 'CLAIMED' | 'PARTIALLY_VERIFIED' | 'VERIFIED';

export interface SourcingParty {
  partyId: string;
  name: string;
  kind: SourcingPartyKind;
  sourceRef: string;
  verification: SourcingVerification;
}

export interface ChinaSourcingOffer {
  offerId: string;
  productId: string;
  supplier: SourcingParty;
  currency: string;
  unitPrice: number;
  minimumOrderQuantity: number;
  incoterms?: string;
  paymentTerms?: string;
  qualityControl?: readonly string[];
  leadTimeDays?: number;
  shippingNotes?: readonly string[];
  evidenceRefs: readonly string[];
}

export interface ChinaSourcingOpportunity {
  opportunityId: string;
  productId: string;
  title: string;
  sourcePlatforms: readonly string[];
  offers: readonly ChinaSourcingOffer[];
  verification: SourcingVerification;
  constraints: readonly string[];
  evidenceRefs: readonly string[];
}

function requiredText(name: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} must be non-empty`);
  return value.trim();
}

function uniqueTexts(name: string, values: readonly string[]): string[] {
  if (!Array.isArray(values)) throw new Error(`${name} must be an array`);
  const normalized = values.map((value) => requiredText(name, value));
  if (new Set(normalized).size !== normalized.length) throw new Error(`${name} must be unique`);
  return normalized;
}

function validateParty(party: SourcingParty): void {
  requiredText('partyId', party.partyId);
  requiredText('party name', party.name);
  requiredText('sourceRef', party.sourceRef);
}

export function validateChinaSourcingOffer(offer: ChinaSourcingOffer): void {
  requiredText('offerId', offer.offerId);
  requiredText('productId', offer.productId);
  validateParty(offer.supplier);
  requiredText('currency', offer.currency);
  if (!Number.isFinite(offer.unitPrice) || offer.unitPrice < 0) throw new Error('unitPrice must be a non-negative number');
  if (!Number.isInteger(offer.minimumOrderQuantity) || offer.minimumOrderQuantity < 1) throw new Error('minimumOrderQuantity must be a positive integer');
  uniqueTexts('evidenceRefs', offer.evidenceRefs);
  if (offer.qualityControl) uniqueTexts('qualityControl', offer.qualityControl);
  if (offer.shippingNotes) uniqueTexts('shippingNotes', offer.shippingNotes);
}

export function createChinaSourcingOpportunity(input: ChinaSourcingOpportunity): ChinaSourcingOpportunity {
  requiredText('opportunityId', input.opportunityId);
  requiredText('productId', input.productId);
  requiredText('title', input.title);
  const sourcePlatforms = uniqueTexts('sourcePlatforms', input.sourcePlatforms);
  const evidenceRefs = uniqueTexts('evidenceRefs', input.evidenceRefs);
  if (input.offers.length === 0) throw new Error('China sourcing opportunity requires at least one offer');
  input.offers.forEach(validateChinaSourcingOffer);
  return {
    ...input,
    sourcePlatforms,
    evidenceRefs,
    offers: input.offers.map((offer) => ({
      ...offer,
      evidenceRefs: [...offer.evidenceRefs],
      ...(offer.qualityControl ? { qualityControl: [...offer.qualityControl] } : {}),
      ...(offer.shippingNotes ? { shippingNotes: [...offer.shippingNotes] } : {}),
    })),
    constraints: [...input.constraints],
  };
}

/** A seller/supplier/factory claim is never silently promoted to verified manufacturer truth. */
export function isVerifiedManufacturer(party: SourcingParty): boolean {
  return party.kind === 'MANUFACTURER' && party.verification === 'VERIFIED';
}
