import { createDecisionRecord, fromDecisionRecord } from './decision';

describe('Decision record boundary', () => {
  const valid = {
    decisionId: 'decision-1',
    question: 'Which authorized resource?',
    options: [
      { id: 'model-a', description: 'First authorized model' },
      { id: 'model-b', description: 'Second authorized model' },
    ],
    selectedOption: 'model-a',
    provider: 'Jev',
    confidence: 0.8,
    context: { traceId: 'trace-1', taskId: 'task-1' },
    timestamp: '2026-09-27T00:00:00.000Z',
  };

  it('rejects a selection outside the listed options', () => {
    expect(() => createDecisionRecord({ ...valid, selectedOption: 'blocked' })).toThrow(
      /selectedOption|option/i,
    );
  });

  it('rejects confidence outside the zero-to-one range', () => {
    expect(() => createDecisionRecord({ ...valid, confidence: 2 })).toThrow(/confidence/i);
  });

  it('requires a valid host timestamp for replay-stable decisions', () => {
    expect(() => createDecisionRecord({ ...valid, timestamp: '' })).toThrow(/timestamp/i);
    expect(() => createDecisionRecord({ ...valid, timestamp: 'not-a-date' })).toThrow(/timestamp/i);
  });

  it('emits bounded DECIDED metadata with a host-supplied event identity', () => {
    const record = createDecisionRecord(valid);
    const event = fromDecisionRecord(record, 'event-1');
    expect(event.type).toBe('DECIDED');
    expect(event.source).toBe('host');
    expect(event.identity).toEqual({
      traceId: 'trace-1',
      traceEventId: 'event-1',
      taskId: 'task-1',
    });
    expect(event.payload).toEqual({
      decisionId: 'decision-1',
      selectedOption: 'model-a',
      provider: 'Jev',
      confidence: 0.8,
    });
    expect(JSON.stringify(event)).not.toContain('Which authorized resource?');
    expect(JSON.stringify(event)).not.toContain('First authorized model');
  });

  it('rejects duplicate option identities', () => {
    expect(() =>
      createDecisionRecord({
        ...valid,
        options: [
          { id: 'model-a', description: 'First' },
          { id: 'model-a', description: 'Duplicate' },
        ],
      }),
    ).toThrow(/duplicate|unique/i);
  });

  it('does not retain unrecognized fields in the decision record', () => {
    const input = { ...valid, apiKey: 'must-not-survive' };
    const record = createDecisionRecord(input);
    expect(record).not.toHaveProperty('apiKey');
    expect(JSON.stringify(record)).not.toContain('must-not-survive');
  });

  it('rejects non-finite or out-of-range thresholds', () => {
    for (const threshold of [NaN, Infinity, -0.01, 1.01]) {
      expect(() => createDecisionRecord({ ...valid, threshold })).toThrow(/threshold/i);
    }
  });

  it('rejects whitespace-only decision and option identities', () => {
    expect(() => createDecisionRecord({ ...valid, decisionId: ' ' })).toThrow(/decisionId/i);
    expect(() => createDecisionRecord({ ...valid, context: { traceId: ' ' } })).toThrow(/traceId/i);
    expect(() =>
      createDecisionRecord({
        ...valid,
        options: [{ id: ' ', description: 'Invalid' }],
        selectedOption: ' ',
      }),
    ).toThrow(/option/i);
  });

  it('copies a complete probability distribution without exposing it to MTO', () => {
    const distribution = [
      { optionId: 'model-a', probability: 0.8 },
      { optionId: 'model-b', probability: 0.2 },
    ];
    const record = createDecisionRecord({ ...valid, distribution });
    distribution[0].probability = 0;
    expect(record.distribution).toEqual([
      { optionId: 'model-a', probability: 0.8 },
      { optionId: 'model-b', probability: 0.2 },
    ]);
    expect(fromDecisionRecord(record, 'event-distribution').payload).not.toHaveProperty(
      'distribution',
    );
  });

  it('rejects incomplete, duplicated, unknown, or invalid probability distributions', () => {
    const invalid = [
      [{ optionId: 'model-a', probability: 1 }],
      [
        { optionId: 'model-a', probability: 0.5 },
        { optionId: 'model-a', probability: 0.5 },
      ],
      [
        { optionId: 'model-a', probability: 0.5 },
        { optionId: 'unknown', probability: 0.5 },
      ],
      [
        { optionId: 'model-a', probability: NaN },
        { optionId: 'model-b', probability: 1 },
      ],
      [
        { optionId: 'model-a', probability: -0.1 },
        { optionId: 'model-b', probability: 1.1 },
      ],
      [
        { optionId: 'model-a', probability: 0.3 },
        { optionId: 'model-b', probability: 0.3 },
      ],
    ];
    for (const distribution of invalid) {
      expect(() => createDecisionRecord({ ...valid, distribution })).toThrow(/distribution/);
    }
  });
});
