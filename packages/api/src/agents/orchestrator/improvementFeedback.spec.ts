import { summarizeImprovementFeedback, validateImprovementOutcome } from './improvementFeedback';
import type { ImprovementOutcome } from './improvementFeedback';

const outcome = (overrides: Partial<ImprovementOutcome> = {}): ImprovementOutcome => ({
  candidateId: 'candidate-1', traceId: 'trace-1', taskId: 'task-1', operation: 'UPDATE', outcome: 'SUCCESS',
  benchmarkScore: 0.9, baselineScore: 0.7, evidenceRefs: ['evidence-1'], observedAt: '2026-10-04T00:00:00.000Z', ...overrides,
});

describe('improvement feedback', () => {
  it('validates bounded outcome evidence', () => expect(() => validateImprovementOutcome(outcome())).not.toThrow());
  it('fails closed on impossible scores and contradictory success errors', () => {
    expect(() => validateImprovementOutcome(outcome({ benchmarkScore: 2 }))).toThrow(/between 0 and 1/);
    expect(() => validateImprovementOutcome(outcome({ errorCode: 'ERR' }))).toThrow(/cannot carry/);
  });
  it('summarizes improvement from benchmark deltas', () => {
    const summary = summarizeImprovementFeedback([outcome(), outcome({ evidenceRefs: ['evidence-2'], benchmarkScore: 0.8, baselineScore: 0.7 })]);
    expect(summary.signal).toBe('IMPROVED');
    expect(summary.sampleCount).toBe(2);
    expect(summary.averageDelta).toBeCloseTo(0.15);
    expect(summary.evidenceRefs).toEqual(['evidence-1', 'evidence-2']);
  });
  it('flags regression before success-rate optimism', () => {
    const summary = summarizeImprovementFeedback([outcome(), outcome({ benchmarkScore: 0.5, baselineScore: 0.7 })]);
    expect(summary.signal).toBe('REGRESSED');
    expect(summary.regressionCount).toBe(1);
  });
});
