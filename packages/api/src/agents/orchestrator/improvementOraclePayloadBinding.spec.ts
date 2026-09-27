import type { MtoEvent } from './mto';
import { createImprovementDisposition } from './disposition';
import { createImprovementCandidate } from './improvement';
import { createDistillValidationRequest } from './distill';

const observation: MtoEvent = {
  type: 'OBSERVED',
  identity: { traceId: 'trace-1', traceEventId: 'event-1' },
  source: 'subagent-activity',
  timestamp: '2026-09-26T00:00:00.000Z',
  payload: { phase: 'run_step_closed', subagentType: 'researcher' },
};

function skillCandidate(payloadDigest = 'digest-abc') {
  return createImprovementCandidate({
    candidateId: 'candidate-skill',
    target: 'skill',
    title: 'Bound exact improvement payload',
    summary: 'Oracle must validate the exact authored update payload digest.',
    traceId: 'trace-1',
    observations: [observation],
    createdAt: '2026-09-26T01:00:00.000Z',
    payloadDigest,
  } as Parameters<typeof createImprovementCandidate>[0] & { payloadDigest: string });
}

function acceptedOracle(candidateJson: string) {
  return {
    phase: 'VERIFIED' as const,
    decision: 'ACCEPT' as const,
    verdict: {
      status: 'VERIFIED' as const,
      taskId: 'task-oracle-1',
      validator: { id: 'oracle-independent', type: 'deterministic' as const },
      timestamp: '2026-09-26T02:00:00.000Z',
      input: {
        taskId: 'task-oracle-1',
        agentId: 'bot-mode-distill',
        candidate: candidateJson,
        criteria: [],
        evidence: [],
      },
      checks: [],
      reasons: [],
      uncertainty: [],
      contradictions: [],
    },
  };
}

describe('Oracle exact improvement payload binding', () => {
  it('preserves a skill payload digest on the bounded candidate', () => {
    const candidate = skillCandidate();
    expect(candidate).toEqual(expect.objectContaining({ payloadDigest: 'digest-abc' }));
  });

  it('fails closed when a skill candidate has no payload digest', () => {
    expect(() =>
      createImprovementCandidate({
        candidateId: 'candidate-skill',
        target: 'skill',
        title: 'Missing payload digest',
        summary: 'A publishable skill candidate cannot be content-unbound.',
        traceId: 'trace-1',
        observations: [observation],
      }),
    ).toThrow(/payload/i);
  });

  it('binds Distill OracleInput candidate and criteria to the exact payload digest', () => {
    const candidate = skillCandidate();
    const request = createDistillValidationRequest({
      taskId: 'task-distill-1',
      producerAgentId: 'bot-mode-distill',
      candidate,
      evidence: [],
    });

    expect(JSON.parse(request.oracleInput.candidate ?? '{}')).toEqual(
      expect.objectContaining({ payloadDigest: 'digest-abc' }),
    );
    expect(request.oracleInput.criteria).toContainEqual({
      id: 'payloadDigest',
      field: 'payloadDigest',
      expected: 'digest-abc',
    });
  });

  it('preserves the Oracle-verified payload digest into disposition', () => {
    const candidate = skillCandidate();
    const request = createDistillValidationRequest({
      taskId: 'task-distill-1',
      producerAgentId: 'bot-mode-distill',
      candidate,
      evidence: [],
    });
    const result = createImprovementDisposition({
      candidate,
      oracle: acceptedOracle(request.oracleInput.candidate ?? '{}'),
    });

    expect(result).toEqual(expect.objectContaining({ payloadDigest: 'digest-abc' }));
  });

  it('rejects Oracle ACCEPT when the verified candidate payload digest differs', () => {
    const candidate = skillCandidate('digest-abc');
    const oracle = acceptedOracle(
      JSON.stringify({
        candidateId: 'candidate-skill',
        target: 'skill',
        status: 'CANDIDATE',
        traceId: 'trace-1',
        payloadDigest: 'digest-substituted',
      }),
    );

    expect(() => createImprovementDisposition({ candidate, oracle })).toThrow(/payload|Oracle/i);
  });
});
