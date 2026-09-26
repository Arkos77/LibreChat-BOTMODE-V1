import type { ImprovementCandidate } from './improvement';
import { createToolEvidenceDistillRequest } from './toolEvidenceDistill';

const candidate: ImprovementCandidate = {
  candidateId: 'candidate-tool-evidence-1',
  target: 'skill',
  title: 'Improve skill behavior',
  summary: 'Bounded improvement candidate',
  traceId: 'trace-tool-evidence-1',
  traceEventIds: ['trace-event-1'],
  signals: [{ kind: 'step_limit', count: 1 }],
  status: 'CANDIDATE',
  publicationPath: 'native-skill-authoring-required',
  payloadDigest: 'digest-tool-evidence-1',
  createdAt: '2026-09-26T12:00:00.000Z',
};

describe('P10 tool evidence to Distill composition', () => {
  it('composes explicit host semantics and native tool provenance into bounded Distill input', () => {
    const result = createToolEvidenceDistillRequest({
      taskId: 'task-native-1',
      producerAgentId: 'producer-agent',
      candidate,
      toolName: 'verify_skill_target',
      toolCallId: 'call-native-1',
      toolAgentId: 'checker-agent',
      runId: 'run-native-1',
      declarations: [
        {
          toolName: 'verify_skill_target',
          criterionId: 'target',
          expectedValue: 'skill',
        },
      ],
    });

    expect(result.status).toBe('READY');
    if (result.status !== 'READY') {
      throw new Error('expected READY');
    }
    expect(result.independent).toBe(true);
    expect(result.oracleInput).toMatchObject({
      taskId: 'task-native-1',
      agentId: 'producer-agent',
      evidence: [
        {
          id: 'call-native-1',
          criterionId: 'target',
          value: 'skill',
          source: { id: 'call-native-1', type: 'tool', agentId: 'checker-agent' },
        },
      ],
    });
    expect(result.oracleInput.candidate).toContain('candidate-tool-evidence-1');
    expect(result.oracleInput.candidate).toContain('digest-tool-evidence-1');
    expect(result).not.toHaveProperty('authorized');
    expect(result).not.toHaveProperty('publishable');
    expect(result).not.toHaveProperty('verdict');
  });

  it('returns NO_DECLARATION instead of interpreting an undeclared tool result', () => {
    expect(
      createToolEvidenceDistillRequest({
        taskId: 'task-native-2',
        producerAgentId: 'producer-agent',
        candidate,
        toolName: 'generic_web_search',
        toolCallId: 'call-native-2',
        declarations: [],
      }),
    ).toEqual({ status: 'NO_DECLARATION' });
  });

  it('preserves same-producer provenance as non-independent for Oracle to fail closed', () => {
    const result = createToolEvidenceDistillRequest({
      taskId: 'task-native-3',
      producerAgentId: 'producer-agent',
      candidate,
      toolName: 'verify_skill_target',
      toolCallId: 'call-native-3',
      toolAgentId: 'producer-agent',
      declarations: [
        {
          toolName: 'verify_skill_target',
          criterionId: 'target',
          expectedValue: 'skill',
        },
      ],
    });

    expect(result.status).toBe('READY');
    if (result.status !== 'READY') {
      throw new Error('expected READY');
    }
    expect(result.independent).toBe(false);
    expect(result.oracleInput.evidence[0].source.agentId).toBe('producer-agent');
  });

  it('fails closed when host semantics do not match a Distill criterion', () => {
    expect(() =>
      createToolEvidenceDistillRequest({
        taskId: 'task-native-4',
        producerAgentId: 'producer-agent',
        candidate,
        toolName: 'verify_unknown',
        toolCallId: 'call-native-4',
        declarations: [
          {
            toolName: 'verify_unknown',
            criterionId: 'unknown-criterion',
            expectedValue: true,
          },
        ],
      }),
    ).toThrow();
  });
});
