import type { OracleEvent, OracleVerdict } from '../oracle';
import type { MtoEvent } from './mto';
import { createImprovementDisposition } from './disposition';
import { createImprovementCandidate } from './improvement';

const observation: MtoEvent = {
  type: 'OBSERVED',
  identity: { traceId: 'trace-1', traceEventId: 'event-1' },
  source: 'subagent-activity',
  timestamp: '2026-09-26T00:00:00.000Z',
  payload: { phase: 'run_step_closed', subagentType: 'researcher' },
};

function candidate(target: 'skill' | 'agent' | 'workflow' | 'specialist' = 'skill') {
  return createImprovementCandidate({
    candidateId: `candidate-${target}`,
    target,
    title: 'Bounded improvement',
    summary: 'Sanitized candidate for disposition testing.',
    traceId: 'trace-1',
    observations: [observation],
    createdAt: '2026-09-26T01:00:00.000Z',
  });
}

function oracleResult(
  decision: 'ACCEPT' | 'REJECT' | 'DEFER' | 'REQUEST_HUMAN_REVIEW',
): Extract<OracleEvent, { verdict: unknown }> {
  let status: OracleVerdict['status'];
  switch (decision) {
    case 'ACCEPT':
      status = 'VERIFIED';
      break;
    case 'REJECT':
      status = 'REJECTED';
      break;
    case 'REQUEST_HUMAN_REVIEW':
      status = 'HUMAN_REVIEW';
      break;
    case 'DEFER':
      status = 'UNKNOWN';
      break;
  }

  const verdict: OracleVerdict = {
    status,
    taskId: 'task-oracle-1',
    validator: { id: 'oracle-independent', kind: 'deterministic' },
    timestamp: '2026-09-26T02:00:00.000Z',
    input: {
      taskId: 'task-oracle-1',
      agentId: 'bot-mode-distill',
      candidate: '{}',
      criteria: [],
      evidence: [],
    },
    checks: [],
    reasons: [],
    uncertainty: [],
    contradictions: [],
  };

  return { phase: status, verdict, decision };
}

describe('Improvement disposition boundary', () => {
  it('maps Oracle ACCEPT for skill to authorization-required without authorizing publication', () => {
    const result = createImprovementDisposition({
      candidate: candidate('skill'),
      oracle: oracleResult('ACCEPT'),
    });

    expect(result).toEqual({
      candidateId: 'candidate-skill',
      traceId: 'trace-1',
      target: 'skill',
      oracleDecision: 'ACCEPT',
      disposition: 'AUTHORIZATION_REQUIRED',
      publicationPath: 'native-skill-authoring-required',
      authorized: false,
      publishable: false,
      requiresHumanReview: false,
    });
  });

  it.each(['agent', 'workflow', 'specialist'] as const)(
    'keeps accepted %s improvements proposal-only',
    (target) => {
      const result = createImprovementDisposition({
        candidate: candidate(target),
        oracle: oracleResult('ACCEPT'),
      });
      expect(result.disposition).toBe('PROPOSAL_ONLY');
      expect(result.authorized).toBe(false);
      expect(result.publishable).toBe(false);
    },
  );

  it.each([
    ['REJECT', 'REJECTED'],
    ['DEFER', 'DEFERRED'],
    ['REQUEST_HUMAN_REVIEW', 'HUMAN_REVIEW_REQUIRED'],
  ] as const)('fails closed for Oracle %s', (decision, disposition) => {
    const result = createImprovementDisposition({
      candidate: candidate('skill'),
      oracle: oracleResult(decision),
    });
    expect(result.disposition).toBe(disposition);
    expect(result.authorized).toBe(false);
    expect(result.publishable).toBe(false);
  });

  it('fails closed when Oracle phase and decision disagree', () => {
    const oracle = oracleResult('ACCEPT');
    if (oracle.phase === 'CANDIDATE' || oracle.phase === 'VALIDATING') {
      throw new Error('unexpected test fixture');
    }

    expect(() =>
      createImprovementDisposition({
        candidate: candidate('skill'),
        oracle: { ...oracle, decision: 'REJECT' },
      }),
    ).toThrow('Oracle');
  });

  it('does not copy verdict evidence, reasoning, candidate prose or grant authority', () => {
    const source = candidate('skill');
    const oracle = oracleResult('ACCEPT');
    if (oracle.phase === 'CANDIDATE' || oracle.phase === 'VALIDATING') {
      throw new Error('unexpected test fixture');
    }

    oracle.verdict.reasons.push({ code: 'CRITERION_FAILED', detail: 'private-reason' });
    const result = createImprovementDisposition({ candidate: source, oracle });
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain(source.title);
    expect(serialized).not.toContain(source.summary);
    expect(serialized).not.toContain('private-reason');
    expect(result).not.toHaveProperty('authorization');
    expect(result).not.toHaveProperty('publication');
  });
});
