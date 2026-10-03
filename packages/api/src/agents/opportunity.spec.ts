import { qualifyOpportunity, validateOpportunity } from './opportunity';
import type { Opportunity } from './opportunity';

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
    currency: 'EUR',
    cashRevenue: 120,
    totalValue: 140,
    costs: 20,
    netValue: 120,
    timeHours: 4,
    capitalRequired: 0,
  },
  constraints: ['remote'],
  qualification: [],
  evidenceRefs: ['evidence-1'],
  ...overrides,
});

describe('opportunity contract', () => {
  it('validates economic arithmetic and provenance', () => {
    expect(() => validateOpportunity(opportunity())).not.toThrow();
  });

  it('rejects inconsistent net value or missing evidence', () => {
    expect(() =>
      validateOpportunity(
        opportunity({
          value: { ...opportunity().value, netValue: 99 },
        }),
      ),
    ).toThrow('Opportunity netValue must equal totalValue minus costs');

    expect(() => validateOpportunity(opportunity({ evidenceRefs: [''] }))).toThrow(
      'Opportunity evidence refs must be non-empty',
    );
  });

  it('qualifies only with an explicit eligibility result', () => {
    const verified = qualifyOpportunity(opportunity(), {
      eligible: 'YES',
      reasons: ['meets geography and skill requirements'],
      verifiedAt: '2026-10-03T12:10:00.000Z',
    });
    expect(verified.status).toBe('VERIFIED');

    expect(
      qualifyOpportunity(opportunity(), {
        eligible: 'NO',
        reasons: ['requires unavailable certification'],
      }).status,
    ).toBe('REJECTED');

    expect(
      qualifyOpportunity(opportunity(), {
        eligible: 'UNKNOWN',
        reasons: ['source conditions not yet verified'],
      }).status,
    ).toBe('QUALIFICATION');
  });

  it('rejects an unexplained positive qualification', () => {
    expect(() =>
      qualifyOpportunity(opportunity(), { eligible: 'YES', reasons: [] }),
    ).toThrow('A positive qualification requires reasons');
  });
});
