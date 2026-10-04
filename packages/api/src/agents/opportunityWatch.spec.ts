import { OpportunityWatchRegistry, OpportunityWatchRunner } from './opportunityWatch';

const signal = (externalId: string, title = 'Remote buyer') => ({
  sourceId: 'workana',
  title,
  category: 'jobs',
  geography: 'FRANCE' as const,
  capturedAt: '2026-10-05T12:00:00.000Z',
  url: `https://example.test/${externalId}`,
  externalId,
});

describe('OpportunityWatchRunner', () => {
  it('tracks new signals and computes economic net value', () => {
    const runner = new OpportunityWatchRunner(new OpportunityWatchRegistry());
    const [record] = runner.run([
      {
        signal: signal('1'),
        checkedAt: '2026-10-05T12:01:00.000Z',
        sourceRef: 'workana:public',
        evidenceRefs: ['workana:1'],
        estimatedValue: 800,
        estimatedCosts: 120,
        valueCurrency: 'EUR',
      },
    ]);

    expect(record.status).toBe('NEW');
    expect(record.estimatedNetValue).toBe(680);
    expect(record.sourceRef).toBe('workana:public');
  });

  it('marks disappeared opportunities stale while preserving the registry history', () => {
    const registry = new OpportunityWatchRegistry();
    const runner = new OpportunityWatchRunner(registry);
    runner.run([
      { signal: signal('1'), checkedAt: '2026-10-05T12:01:00.000Z', sourceRef: 'workana:public' },
      { signal: signal('2'), checkedAt: '2026-10-05T12:01:00.000Z', sourceRef: 'workana:public' },
    ]);
    runner.run([
      { signal: signal('1'), checkedAt: '2026-10-05T12:31:00.000Z', sourceRef: 'workana:public' },
    ]);
    expect(registry.list().find((r) => r.signal.externalId === '2')?.status).toBe('STALE');
    expect(registry.size()).toBe(2);
  });

  it('deduplicates repeated source signals and enforces a bound', () => {
    const runner = new OpportunityWatchRunner(new OpportunityWatchRegistry(), {
      maxObservations: 2,
    });
    const duplicate = signal('1');
    const result = runner.run([
      { signal: duplicate, checkedAt: '2026-10-05T12:01:00.000Z', sourceRef: 'workana:public' },
      { signal: duplicate, checkedAt: '2026-10-05T12:01:00.000Z', sourceRef: 'workana:public' },
    ]);
    expect(result).toHaveLength(1);
    expect(() =>
      runner.run([
        { signal: signal('2'), checkedAt: '2026-10-05T12:01:00.000Z', sourceRef: 'workana:public' },
        { signal: signal('3'), checkedAt: '2026-10-05T12:01:00.000Z', sourceRef: 'workana:public' },
        { signal: signal('4'), checkedAt: '2026-10-05T12:01:00.000Z', sourceRef: 'workana:public' },
      ]),
    ).toThrow('observation limit');
  });
});
