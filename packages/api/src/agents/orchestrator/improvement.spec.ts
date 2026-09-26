import type { MtoEvent } from './mto';
import { createImprovementCandidate, summarizeImprovementSignals } from './improvement';

const observation = (overrides: Partial<MtoEvent> = {}): MtoEvent => ({
  type: 'OBSERVED',
  identity: { traceId: 'trace-1', traceEventId: 'event-1' },
  source: 'subagent-activity',
  timestamp: '2026-09-26T00:00:00.000Z',
  payload: { phase: 'run_step_closed', subagentType: 'researcher' },
  ...overrides,
});

describe('controlled improvement contracts', () => {
  it('aggregates only sanitized observation metadata deterministically', () => {
    const observations: MtoEvent[] = [
      observation(),
      observation({
        type: 'VERIFIED',
        identity: { traceId: 'trace-1', traceEventId: 'event-2' },
        source: 'oracle',
        payload: {
          phase: 'VERIFIED',
          decision: 'ACCEPT',
          validator: { id: 'oracle', type: 'deterministic' },
          reasonCodes: ['CRITERION_MET'],
          uncertainty: [],
          checkCount: 1,
          contradictionCount: 0,
          evidenceCount: 1,
        },
      }),
      observation({
        type: 'REJECTED',
        identity: { traceId: 'trace-1', traceEventId: 'event-3' },
        source: 'oracle',
        payload: {
          phase: 'REJECTED',
          decision: 'REJECT',
          validator: { id: 'oracle', type: 'deterministic' },
          reasonCodes: ['CRITERION_FAILED'],
          uncertainty: [],
          checkCount: 1,
          contradictionCount: 0,
          evidenceCount: 1,
        },
      }),
    ];

    expect(summarizeImprovementSignals(observations)).toEqual({
      observationCount: 3,
      sourceCounts: { 'subagent-activity': 1, oracle: 2 },
      typeCounts: { OBSERVED: 1, VERIFIED: 1, REJECTED: 1 },
      oracle: {
        verified: 1,
        rejected: 1,
        humanReview: 0,
        unknown: 0,
        reasonCodes: { CRITERION_MET: 1, CRITERION_FAILED: 1 },
      },
    });
  });

  it('creates a skill candidate without publishing or granting authority', () => {
    const events = [observation()];
    const before = structuredClone(events);
    const candidate = createImprovementCandidate({
      candidateId: 'candidate-1',
      target: 'skill',
      payloadDigest: 'digest-abc',
      title: 'Improve research verification',
      summary: 'Repeated observations justify a candidate skill refinement.',
      traceId: 'trace-1',
      observations: events,
      createdAt: '2026-09-26T01:00:00.000Z',
    });

    expect(candidate.status).toBe('CANDIDATE');
    expect(candidate.publication).toEqual({
      path: 'native-skill-authoring-required',
      requiresOracle: true,
      requiresAuthorization: true,
      requiresHumanReview: false,
    });
    expect(candidate.traceEventIds).toEqual(['event-1']);
    expect(events).toEqual(before);
    expect(JSON.stringify(candidate)).not.toMatch(/PUBLISHED|COMMITTED|AUTHORIZED/);
  });

  it.each(['agent', 'workflow', 'specialist'] as const)(
    'keeps %s improvements proposal-only',
    (target) => {
      const candidate = createImprovementCandidate({
        candidateId: `candidate-${target}`,
        target,
        title: `Candidate ${target}`,
        summary: 'Proposal only until a safe native publication contract is proven.',
        traceId: 'trace-1',
        observations: [observation()],
        createdAt: '2026-09-26T01:00:00.000Z',
      });
      expect(candidate.publication.path).toBe('proposal-only');
      expect(candidate.publication.requiresAuthorization).toBe(true);
      expect(candidate.publication.requiresOracle).toBe(true);
    },
  );

  it('deduplicates evidence references without inventing native identities', () => {
    const candidate = createImprovementCandidate({
      candidateId: 'candidate-dedup',
      target: 'skill',
      payloadDigest: 'digest-abc',
      title: 'Deduplicated evidence',
      summary: 'Trace references are stable and bounded to supplied observations.',
      traceId: 'trace-1',
      observations: [
        observation({ identity: { traceId: 'trace-1', traceEventId: 'z' } }),
        observation({ identity: { traceId: 'trace-1', traceEventId: 'a', taskId: 'task-1' } }),
        observation({ identity: { traceId: 'trace-1', traceEventId: 'z', runId: 'run-1' } }),
      ],
      createdAt: '2026-09-26T01:00:00.000Z',
    });
    expect(candidate.traceEventIds).toEqual(['a', 'z']);
    expect(candidate).not.toHaveProperty('taskId');
    expect(candidate).not.toHaveProperty('runId');
  });

  it('fails closed for empty or cross-trace observations', () => {
    expect(() =>
      createImprovementCandidate({
        candidateId: 'candidate-empty',
        target: 'skill',
        payloadDigest: 'digest-abc',
        title: 'Empty',
        summary: 'No observation exists.',
        traceId: 'trace-1',
        observations: [],
      }),
    ).toThrow('at least one observation');

    expect(() =>
      createImprovementCandidate({
        candidateId: 'candidate-cross',
        target: 'skill',
        payloadDigest: 'digest-abc',
        title: 'Cross trace',
        summary: 'Mixed trace data must not be merged implicitly.',
        traceId: 'trace-1',
        observations: [
          observation(),
          observation({ identity: { traceId: 'trace-2', traceEventId: 'event-2' } }),
        ],
      }),
    ).toThrow('share the candidate traceId');
  });

  it('keeps sensitive source content outside the candidate surface', () => {
    const event = observation({
      payload: {
        phase: 'run_step_closed',
        subagentType: 'researcher',
        data: { reasoning: 'must never be copied' },
      },
    });
    const candidate = createImprovementCandidate({
      candidateId: 'candidate-safe',
      target: 'skill',
      payloadDigest: 'digest-abc',
      title: 'Safe metadata candidate',
      summary: 'The candidate stores aggregates and references, not source event payloads.',
      traceId: 'trace-1',
      observations: [event],
      createdAt: '2026-09-26T01:00:00.000Z',
    });
    expect(JSON.stringify(candidate)).not.toContain('must never be copied');
    expect(candidate).not.toHaveProperty('observations');
  });

  it('fails closed for an unsupported runtime target', () => {
    expect(() =>
      createImprovementCandidate({
        candidateId: 'candidate-invalid-target',
        target: 'source-code' as never,
        title: 'Invalid target',
        summary: 'Runtime input must not bypass the supported target set.',
        traceId: 'trace-1',
        observations: [observation()],
      }),
    ).toThrow('target is not supported');
  });

  it('ignores malformed Oracle payloads instead of trusting a phase-shaped object', () => {
    const malformed = observation({
      type: 'VERIFIED',
      source: 'oracle',
      payload: { phase: 'NOT_AN_ORACLE_PHASE', reasonCodes: ['SHOULD_NOT_COUNT'] },
    });
    const summary = summarizeImprovementSignals([malformed]);
    expect(summary.oracle).toEqual({
      verified: 0,
      rejected: 0,
      humanReview: 0,
      unknown: 0,
      reasonCodes: {},
    });
  });
});
