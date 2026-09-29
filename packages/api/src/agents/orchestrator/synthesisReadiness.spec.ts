import type { OracleDecision, OracleEvent, OracleStatus, OracleVerdict } from '~/agents/oracle';
import { evaluateSynthesisReadiness } from './synthesisReadiness';

function oracle(
  taskId: string,
  decision: OracleDecision,
): Extract<OracleEvent, { verdict: unknown }> {
  const statusByDecision: Record<OracleDecision, OracleStatus> = {
    ACCEPT: 'VERIFIED',
    REJECT: 'REJECTED',
    DEFER: 'UNKNOWN',
    REQUEST_HUMAN_REVIEW: 'HUMAN_REVIEW',
  };
  const status = statusByDecision[decision];
  const verdict: OracleVerdict = {
    status,
    input: {
      taskId,
      agentId: 'producer',
      candidate: '{"answer":42}',
      criteria: [],
      evidence: [],
    },
    reasons: [],
    checks: [],
    contradictions: [],
    uncertainty: [],
    validator: { id: 'oracle-independent', type: 'deterministic' },
    timestamp: '2026-09-29T12:00:00.000Z',
  };
  return { phase: status, verdict, decision };
}

describe('synthesis readiness', () => {
  const required = [
    { taskId: 'mission/a', nodeId: 'node-a' },
    { taskId: 'mission/b', nodeId: 'node-b' },
  ];

  it('is ready only when every required critical task is VERIFIED', () => {
    expect(
      evaluateSynthesisReadiness(required, [
        { taskId: 'mission/a', nodeId: 'node-a', oracle: oracle('mission/a', 'ACCEPT') },
        { taskId: 'mission/b', nodeId: 'node-b', oracle: oracle('mission/b', 'ACCEPT') },
      ]),
    ).toEqual({
      ready: true,
      status: 'READY',
      requiredTaskIds: ['mission/a', 'mission/b'],
      verifiedTaskIds: ['mission/a', 'mission/b'],
      blockedTaskIds: [],
    });
  });

  it('fails closed when a required verdict is missing', () => {
    expect(
      evaluateSynthesisReadiness(required, [
        { taskId: 'mission/a', nodeId: 'node-a', oracle: oracle('mission/a', 'ACCEPT') },
      ]),
    ).toMatchObject({
      ready: false,
      status: 'BLOCKED_MISSING_VERDICT',
      verifiedTaskIds: ['mission/a'],
      blockedTaskIds: ['mission/b'],
    });
  });

  it.each([
    ['REJECT', 'BLOCKED_REJECTED'],
    ['DEFER', 'BLOCKED_UNKNOWN'],
    ['REQUEST_HUMAN_REVIEW', 'BLOCKED_HUMAN_REVIEW'],
  ] as const)('blocks synthesis for Oracle %s', (decision, status) => {
    expect(
      evaluateSynthesisReadiness(
        [{ taskId: 'mission/a', nodeId: 'node-a' }],
        [{ taskId: 'mission/a', nodeId: 'node-a', oracle: oracle('mission/a', decision) }],
      ),
    ).toMatchObject({
      ready: false,
      status,
      verifiedTaskIds: [],
      blockedTaskIds: ['mission/a'],
    });
  });

  it('rejects mismatched task or node identity', () => {
    expect(() =>
      evaluateSynthesisReadiness(
        [{ taskId: 'mission/a', nodeId: 'node-a' }],
        [{ taskId: 'mission/a', nodeId: 'node-b', oracle: oracle('mission/a', 'ACCEPT') }],
      ),
    ).toThrow('node identity');

    expect(() =>
      evaluateSynthesisReadiness(
        [{ taskId: 'mission/a', nodeId: 'node-a' }],
        [{ taskId: 'mission/a', nodeId: 'node-a', oracle: oracle('other', 'ACCEPT') }],
      ),
    ).toThrow('task identity');
  });

  it('rejects inconsistent terminal Oracle phase/status/decision', () => {
    const result = oracle('mission/a', 'ACCEPT');
    expect(() =>
      evaluateSynthesisReadiness(
        [{ taskId: 'mission/a', nodeId: 'node-a' }],
        [{ taskId: 'mission/a', nodeId: 'node-a', oracle: { ...result, decision: 'REJECT' } }],
      ),
    ).toThrow('must agree');
  });

  it('exposes no execution, authorization, settlement or publication authority', () => {
    const result = evaluateSynthesisReadiness(
      [{ taskId: 'mission/a', nodeId: 'node-a' }],
      [{ taskId: 'mission/a', nodeId: 'node-a', oracle: oracle('mission/a', 'ACCEPT') }],
    );
    expect(result).not.toHaveProperty('authorization');
    expect(result).not.toHaveProperty('execution');
    expect(result).not.toHaveProperty('settlement');
    expect(result).not.toHaveProperty('publishable');
  });
});
