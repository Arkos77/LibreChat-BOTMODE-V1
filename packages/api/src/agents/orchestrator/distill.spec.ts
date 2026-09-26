import type { OracleEvidence } from '../oracle';
import type { MtoEvent } from './mto';
import { createImprovementCandidate } from './improvement';
import { createDistillValidationRequest } from './distill';

const observation: MtoEvent = {
  type: 'OBSERVED',
  identity: { traceId: 'trace-1', traceEventId: 'event-1' },
  source: 'subagent-activity',
  timestamp: '2026-09-26T00:00:00.000Z',
  payload: { phase: 'run_step_closed', subagentType: 'researcher' },
};

const candidate = createImprovementCandidate({
  candidateId: 'candidate-1',
  target: 'skill',
  payloadDigest: 'digest-abc',
  title: 'Improve research verification',
  summary: 'Repeated sanitized observations justify independent validation.',
  traceId: 'trace-1',
  observations: [observation],
  createdAt: '2026-09-26T01:00:00.000Z',
});

const evidence: OracleEvidence[] = [
  {
    id: 'evidence-1',
    criterionId: 'target',
    value: 'skill',
    source: { id: 'host-proof-1', type: 'tool' },
  },
];

describe('Distill validation boundary', () => {
  it('prepares a bounded OracleInput without validating, authorizing or publishing', () => {
    const request = createDistillValidationRequest({
      taskId: 'task-distill-1',
      producerAgentId: 'bot-mode-distill',
      candidate,
      evidence,
    });

    expect(request.candidateId).toBe('candidate-1');
    expect(request.traceId).toBe('trace-1');
    expect(request.oracleInput.taskId).toBe('task-distill-1');
    expect(request.oracleInput.agentId).toBe('bot-mode-distill');
    expect(JSON.parse(request.oracleInput.candidate ?? '{}')).toEqual({
      candidateId: 'candidate-1',
      target: 'skill',
      status: 'CANDIDATE',
      traceId: 'trace-1',
      payloadDigest: 'digest-abc',
    });
    expect(request.oracleInput.criteria).toEqual([
      { id: 'candidateId', field: 'candidateId', expected: 'candidate-1' },
      { id: 'target', field: 'target', expected: 'skill', requireEvidence: true },
      { id: 'status', field: 'status', expected: 'CANDIDATE' },
      { id: 'traceId', field: 'traceId', expected: 'trace-1' },
      { id: 'payloadDigest', field: 'payloadDigest', expected: 'digest-abc' },
    ]);
    expect(request.oracleInput.evidence).toEqual(evidence);
    expect(request).not.toHaveProperty('verdict');
    expect(request).not.toHaveProperty('decision');
    expect(request).not.toHaveProperty('authorization');
    expect(request).not.toHaveProperty('publication');
  });

  it('does not copy improvement prose, signals, source observations or reasoning', () => {
    const request = createDistillValidationRequest({
      taskId: 'task-distill-2',
      producerAgentId: 'bot-mode-distill',
      candidate,
      evidence: [],
    });
    const serialized = JSON.stringify(request);

    expect(serialized).not.toContain(candidate.title);
    expect(serialized).not.toContain(candidate.summary);
    expect(serialized).not.toContain('run_step_closed');
    expect(request.oracleInput.candidate).not.toContain('signals');
    expect(request.oracleInput.candidate).not.toContain('publication');
  });

  it('fails closed for mismatched evidence and invalid producer identity', () => {
    expect(() =>
      createDistillValidationRequest({
        taskId: 'task-distill-3',
        producerAgentId: '',
        candidate,
        evidence: [],
      }),
    ).toThrow('producerAgentId');

    expect(() =>
      createDistillValidationRequest({
        taskId: 'task-distill-4',
        producerAgentId: 'bot-mode-distill',
        candidate,
        evidence: [
          {
            id: 'bad-evidence',
            criterionId: 'not-a-distill-criterion',
            value: true,
            source: { id: 'host-proof-bad', type: 'tool' },
          },
        ],
      }),
    ).toThrow('criterionId');
  });
});
