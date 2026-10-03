import { validateCapabilityEvaluation } from './capabilityEvaluation';
import type { CapabilityEvaluation } from './capabilityEvaluation';

const evaluation = (
  overrides: Partial<CapabilityEvaluation> = {},
): CapabilityEvaluation => ({
  resourceId: 'provider-1',
  status: 'EVALUATED',
  availability: 'AVAILABLE',
  api: 'PRESENT',
  license: 'COMPATIBLE',
  pricing: 'MIXED',
  security: 'ACCEPTED',
  privacy: 'CLOUD',
  compatibility: 'COMPATIBLE',
  maturity: 'STABLE',
  evidenceRefs: ['evidence-1'],
  evaluatedAt: '2026-10-03T12:00:00.000Z',
  ...overrides,
});

describe('capability evaluation', () => {
  it('accepts a fully evidenced evaluation', () => {
    expect(() => validateCapabilityEvaluation(evaluation())).not.toThrow();
  });

  it('blocks approval without all admission evidence', () => {
    expect(() =>
      validateCapabilityEvaluation(
        evaluation({ status: 'APPROVED', security: 'REVIEW_REQUIRED' }),
      ),
    ).toThrow('Approved capability requires security, compatibility and availability evidence');

    expect(() =>
      validateCapabilityEvaluation(
        evaluation({ status: 'APPROVED', availability: 'UNKNOWN' }),
      ),
    ).toThrow('Approved capability requires security, compatibility and availability evidence');
  });

  it('rejects empty evidence references', () => {
    expect(() =>
      validateCapabilityEvaluation(evaluation({ evidenceRefs: [''] })),
    ).toThrow('Capability evaluation evidence refs must be non-empty');
  });

  it('rejects missing resource identity', () => {
    expect(() =>
      validateCapabilityEvaluation(evaluation({ resourceId: '' })),
    ).toThrow('Capability evaluation requires resourceId');
  });
});
