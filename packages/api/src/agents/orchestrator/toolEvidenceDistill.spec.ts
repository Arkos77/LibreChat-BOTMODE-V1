import { createToolEvidenceDistillRequest } from './toolEvidenceDistill';
import { deterministicOracle } from '../oracle/deterministic';
import { createImprovementCandidate } from './improvement';

const candidate = createImprovementCandidate({
  candidateId: 'candidate-tool-evidence-1',
  target: 'skill',
  title: 'Improve skill behavior',
  summary: 'Bounded improvement candidate',
  traceId: 'trace-tool-evidence-1',
  observations: [
    {
      type: 'OBSERVED',
      identity: { traceId: 'trace-tool-evidence-1', traceEventId: 'trace-event-1' },
      source: 'host',
      timestamp: '2026-09-26T12:00:00.000Z',
    },
  ],
  payloadDigest: 'digest-tool-evidence-1',
  createdAt: '2026-09-26T12:00:00.000Z',
});

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

  it('keeps workflow validation unknown without a checker and verifies only explicit independent tool provenance', async () => {
    const workflow = createImprovementCandidate({
      candidateId: 'workflow-step-limit:trace-1:task-1',
      target: 'workflow',
      title: 'Review limit',
      summary: 'Review workflow',
      traceId: 'trace-1',
      observations: [
        {
          type: 'OBSERVED',
          identity: { traceId: 'trace-1', traceEventId: 'step-limit:response-1' },
          source: 'host',
          timestamp: '2026-09-27T18:00:00.000Z',
        },
      ],
      createdAt: '2026-09-27T18:00:00.000Z',
    });
    const base = {
      taskId: 'task-1',
      producerAgentId: 'producer-agent',
      candidate: workflow,
      toolName: 'host_verify_workflow_target',
      toolCallId: 'call-1',
      declarations: [
        {
          toolName: 'host_verify_workflow_target',
          criterionId: 'target',
          expectedValue: 'workflow' as const,
        },
      ],
    };
    const unattributed = createToolEvidenceDistillRequest(base);
    expect(unattributed.status).toBe('READY');
    if (unattributed.status !== 'READY') throw new Error('Expected bounded request');
    expect(unattributed.independent).toBe(false);
    const unknown = await deterministicOracle.validate(unattributed.oracleInput);
    expect(unknown.status).toBe('UNKNOWN');
    expect(unknown.uncertainty).toContain('INDEPENDENT_EVIDENCE_MISSING');
    const attributed = createToolEvidenceDistillRequest({ ...base, toolAgentId: 'checker-agent' });
    expect(attributed.status).toBe('READY');
    if (attributed.status !== 'READY') throw new Error('Expected bounded request');
    expect(attributed.independent).toBe(true);
    const verified = await deterministicOracle.validate(attributed.oracleInput);
    expect(verified.status).toBe('VERIFIED');
    expect(verified).not.toHaveProperty('authorized');
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

  it('keeps a tool with no checker identity non-independent', () => {
    const result = createToolEvidenceDistillRequest({
      taskId: 'task-unattributed',
      producerAgentId: 'producer-agent',
      candidate,
      toolName: 'verify_skill_target',
      toolCallId: 'call-unattributed',
      declarations: [
        { toolName: 'verify_skill_target', criterionId: 'target', expectedValue: 'skill' },
      ],
    });
    expect(result.status).toBe('READY');
    if (result.status === 'READY') expect(result.independent).toBe(false);
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
