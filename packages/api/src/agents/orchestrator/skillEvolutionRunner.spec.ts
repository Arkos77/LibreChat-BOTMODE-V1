import type { MtoEvent } from './mto';
import { SkillEvolutionRunner } from './skillEvolutionRunner';
import type { ImprovementOutcome } from './improvementFeedback';

const observation = (id: string): MtoEvent => ({
  type: 'OBSERVED',
  identity: { traceId: 'trace-1', traceEventId: id },
  source: 'subagent-activity',
  timestamp: '2026-10-04T00:00:00.000Z',
  payload: { phase: 'run_step_closed', subagentType: 'researcher' },
});

const outcome = (overrides: Partial<ImprovementOutcome> = {}): ImprovementOutcome => ({
  candidateId: 'candidate-1',
  traceId: 'trace-1',
  taskId: 'task-1',
  operation: 'UPDATE',
  outcome: 'SUCCESS',
  benchmarkScore: 0.9,
  baselineScore: 0.7,
  evidenceRefs: ['evidence:1'],
  observedAt: '2026-10-04T00:00:00.000Z',
  ...overrides,
});

const input = (overrides: Partial<Parameters<SkillEvolutionRunner['run']>[0]> = {}) => ({
  candidateId: 'candidate-1',
  traceId: 'trace-1',
  title: 'Improve research verification',
  summary: 'Observed consistent benchmark improvement.',
  observations: [observation('event-1')],
  outcomes: [outcome()],
  payloadDigest: 'digest-1',
  ...overrides,
});

describe('skill evolution runner', () => {
  it('creates a candidate only after deterministic improvement feedback', () => {
    const result = new SkillEvolutionRunner().run(input());

    expect(result.decision).toBe('PROPOSE');
    expect(result.reason).toBe('IMPROVED');
    expect(result.feedback.averageDelta).toBe(0.20000000000000007);
    expect(result.candidate).toMatchObject({
      candidateId: 'candidate-1',
      target: 'skill',
      status: 'CANDIDATE',
      publication: {
        path: 'native-skill-authoring-required',
        requiresOracle: true,
        requiresAuthorization: true,
      },
    });
  });

  it.each([
    ['REGRESSED', outcome({ benchmarkScore: 0.4, baselineScore: 0.7 })],
    ['UNCHANGED', outcome({ benchmarkScore: 0.7, baselineScore: 0.7 })],
  ] as const)('holds on %s without producing a candidate', (_signal, failedOutcome) => {
    const result = new SkillEvolutionRunner().run(input({ outcomes: [failedOutcome] }));
    expect(result.decision).toBe('HOLD');
    expect(result.candidate).toBeUndefined();
  });

  it('holds when benchmark evidence does not show improvement', () => {
    const result = new SkillEvolutionRunner().run(
      input({ outcomes: [outcome({ benchmarkScore: undefined, baselineScore: undefined })] }),
    );
    expect(result.reason).toBe('UNCHANGED');
    expect(result.decision).toBe('HOLD');
  });

  it('enforces observation and outcome bounds', () => {
    const observationRunner = new SkillEvolutionRunner({ maxObservations: 1 });
    expect(() =>
      observationRunner.run(input({ observations: [observation('a'), observation('b')] })),
    ).toThrow(/observation limit/);

    const outcomeRunner = new SkillEvolutionRunner({ maxOutcomes: 1 });
    expect(() =>
      outcomeRunner.run(input({ outcomes: [outcome(), outcome({ candidateId: 'candidate-2' })] })),
    ).toThrow(/outcome limit/);
  });

  it('never emits authorization or publication state', () => {
    const result = new SkillEvolutionRunner().run(input());
    expect(JSON.stringify(result)).not.toMatch(/AUTHORIZED|COMMITTED|PUBLISHED/);
    expect(result.candidate).not.toHaveProperty('authorization');
    expect(result.candidate).not.toHaveProperty('publishedAt');
  });

  it('requires a payload digest for skill candidates', () => {
    expect(() => new SkillEvolutionRunner().run(input({ payloadDigest: '' }))).toThrow(
      /payloadDigest/,
    );
  });
});
