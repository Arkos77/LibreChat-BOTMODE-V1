export type OpportunityStatus =
  | 'SIGNAL'
  | 'QUALIFICATION'
  | 'VERIFIED'
  | 'ANALYSIS'
  | 'EXECUTION_READY'
  | 'EXPIRED'
  | 'REJECTED';

export interface OpportunitySource {
  sourceId: string;
  name: string;
  url?: string;
  provenance: 'PUBLIC' | 'USER' | 'PARTNER' | 'INTERNAL';
  capturedAt: string;
  verifiedAt?: string;
}

export interface OpportunityValue {
  currency: string;
  cashRevenue?: number;
  productValue?: number;
  serviceValue?: number;
  reimbursement?: number;
  strategicValue?: number;
  totalValue: number;
  costs: number;
  netValue: number;
  timeHours?: number;
  capitalRequired?: number;
}

export interface Opportunity {
  opportunityId: string;
  title: string;
  category: string;
  geography: 'FRANCE' | 'FRANCOPHONE' | 'EUROPE' | 'INTERNATIONAL';
  status: OpportunityStatus;
  source: OpportunitySource;
  value: OpportunityValue;
  constraints: readonly string[];
  qualification: readonly string[];
  evidenceRefs: readonly string[];
}

export interface OpportunityQualification {
  eligible: 'YES' | 'NO' | 'UNKNOWN';
  reasons: readonly string[];
  verifiedAt?: string;
}

export interface OpportunitySignal {
  sourceId: string;
  title: string;
  category: string;
  geography: Opportunity['geography'];
  capturedAt: string;
  url?: string;
  externalId?: string;
}

function requiredText(name: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} must be non-empty`);
  }
  return value.trim();
}

function validDate(name: string, value: string): string {
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`${name} must be a valid date`);
  }
  return value;
}

function normalizeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.searchParams.sort();
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return url.trim();
  }
}

/** Converts a bounded source signal into a canonical comparison form. */
export function normalizeOpportunitySignal(signal: OpportunitySignal): OpportunitySignal {
  return {
    sourceId: requiredText('sourceId', signal.sourceId),
    title: requiredText('title', signal.title).replace(/\s+/g, ' '),
    category: requiredText('category', signal.category).toLowerCase(),
    geography: signal.geography,
    capturedAt: validDate('capturedAt', signal.capturedAt),
    ...(signal.url ? { url: normalizeUrl(signal.url) } : {}),
    ...(signal.externalId ? { externalId: requiredText('externalId', signal.externalId) } : {}),
  };
}

/** Stable identity used only for deduplication; it is not an execution identity. */
export function opportunitySignalKey(signal: OpportunitySignal): string {
  const normalized = normalizeOpportunitySignal(signal);
  return normalized.externalId
    ? `${normalized.sourceId}:external:${normalized.externalId}`
    : `${normalized.sourceId}:url:${normalized.url ?? normalized.title.toLowerCase()}`;
}

/** Deterministic first-wins deduplication of source signals. */
export function deduplicateOpportunitySignals(signals: readonly OpportunitySignal[]): OpportunitySignal[] {
  const seen = new Set<string>();
  const result: OpportunitySignal[] = [];
  for (const signal of signals) {
    const normalized = normalizeOpportunitySignal(signal);
    const key = opportunitySignalKey(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

export function validateOpportunity(opportunity: Opportunity): void {
  if (!opportunity.opportunityId || !opportunity.title || !opportunity.category) {
    throw new Error('Opportunity identity and classification are required');
  }
  if (!Number.isFinite(opportunity.value.totalValue) || !Number.isFinite(opportunity.value.costs)) {
    throw new Error('Opportunity value must be numeric');
  }
  if (opportunity.value.netValue !== opportunity.value.totalValue - opportunity.value.costs) {
    throw new Error('Opportunity netValue must equal totalValue minus costs');
  }
  if (opportunity.evidenceRefs.some((ref) => !ref)) {
    throw new Error('Opportunity evidence refs must be non-empty');
  }
  if (!opportunity.source.sourceId || !opportunity.source.name) {
    throw new Error('Opportunity source identity is required');
  }
}

export function qualifyOpportunity(
  opportunity: Opportunity,
  qualification: OpportunityQualification,
): Opportunity {
  if (qualification.eligible === 'YES' && qualification.reasons.length === 0) {
    throw new Error('A positive qualification requires reasons');
  }
  return {
    ...opportunity,
    status:
      qualification.eligible === 'YES'
        ? 'VERIFIED'
        : qualification.eligible === 'NO'
          ? 'REJECTED'
          : 'QUALIFICATION',
    qualification: [...qualification.reasons],
  };
}
