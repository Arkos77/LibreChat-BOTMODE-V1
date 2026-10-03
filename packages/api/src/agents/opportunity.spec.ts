import {
  deduplicateOpportunitySignals,
  normalizeOpportunitySignal,
  opportunitySignalKey,
  qualifyOpportunity,
  validateOpportunity,
} from './opportunity';
import type { Opportunity, OpportunitySignal } from './opportunity';

const opportunity = (overrides: Partial<Opportunity> = {}): Opportunity => ({
  opportunityId: 'opp-1',
  title: 'Remote research mission',
  category: 'jobs',
  geography: 'EUROPE',
  status: 'SIGNAL',
  source: {
    sourceId: 'source-1',
    name: 'Example',
    provenance: 'PUBLIC',
    capturedAt: '2026-10-03T12:00:00.000Z',
  },
  value: {
    currency: 'EUR', cashRevenue: 120, totalValue: 140, costs: 20, netValue: 120, timeHours: 4, capitalRequired: 0,
  },
  constraints: ['remote'], qualification: [], evidenceRefs: ['evidence-1'], ...overrides,
});

const signal = (overrides: Partial<OpportunitySignal> = {}): OpportunitySignal => ({
  sourceId: 'upwork', title: '  Remote   research mission ', category: 'Jobs', geography: 'EUROPE',
  capturedAt: '2026-10-03T12:00:00.000Z', url: 'https://example.com/opportunity/#fragment', ...overrides,
});

describe('opportunity contract', () => {
  it('validates economic arithmetic and provenance', () => expect(() => validateOpportunity(opportunity())).not.toThrow());

  it('rejects inconsistent net value or missing evidence', () => {
    expect(() => validateOpportunity(opportunity({ value: { ...opportunity().value, netValue: 99 } }))).toThrow(
      'Opportunity netValue must equal totalValue minus costs',
    );
    expect(() => validateOpportunity(opportunity({ evidenceRefs: [''] }))).toThrow(
      'Opportunity evidence refs must be non-empty',
    );
  });

  it('qualifies only with an explicit eligibility result', () => {
    expect(qualifyOpportunity(opportunity(), { eligible: 'YES', reasons: ['meets requirements'] }).status).toBe('VERIFIED');
    expect(qualifyOpportunity(opportunity(), { eligible: 'NO', reasons: ['unavailable'] }).status).toBe('REJECTED');
    expect(qualifyOpportunity(opportunity(), { eligible: 'UNKNOWN', reasons: ['not verified'] }).status).toBe('QUALIFICATION');
  });

  it('rejects an unexplained positive qualification', () => {
    expect(() => qualifyOpportunity(opportunity(), { eligible: 'YES', reasons: [] })).toThrow(
      'A positive qualification requires reasons',
    );
  });

  it('normalizes source signals deterministically', () => {
    const normalized = normalizeOpportunitySignal(signal());
    expect(normalized.title).toBe('Remote research mission');
    expect(normalized.category).toBe('jobs');
    expect(normalized.url).toBe('https://example.com/opportunity');
  });

  it('deduplicates repeated source signals by external id or canonical url', () => {
    const duplicate = signal({ title: 'Remote research mission', url: 'https://example.com/opportunity' });
    expect(opportunitySignalKey(signal())).toBe(opportunitySignalKey(duplicate));
    expect(deduplicateOpportunitySignals([signal(), duplicate, signal({ externalId: '42' }), signal({ externalId: '42' })])).toHaveLength(2);
  });
});
