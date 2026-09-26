import { createNativeToolEvidence } from './toolEvidence';

describe('P10 native tool evidence adapter', () => {
  it('preserves native tool call, run and checker identities without inventing authority', () => {
    const resolved = createNativeToolEvidence({
      toolCallId: 'call-test-1',
      toolAgentId: 'checker-agent',
      producerAgentId: 'producer-agent',
      criterionId: 'target',
      value: 'skill',
      runId: 'run-test-1',
    });

    expect(resolved).toEqual({
      evidence: {
        id: 'call-test-1',
        criterionId: 'target',
        value: 'skill',
        source: {
          id: 'call-test-1',
          type: 'tool',
          agentId: 'checker-agent',
        },
      },
      independent: true,
      provenance: {
        toolCallId: 'call-test-1',
        runId: 'run-test-1',
        toolAgentId: 'checker-agent',
      },
    });
    expect(resolved).not.toHaveProperty('authorized');
    expect(resolved).not.toHaveProperty('publishable');
    expect(resolved).not.toHaveProperty('verdict');
  });

  it('fails closed when the native tool call identity is missing', () => {
    expect(() =>
      createNativeToolEvidence({
        toolCallId: ' ',
        toolAgentId: 'checker-agent',
        producerAgentId: 'producer-agent',
        criterionId: 'target',
        value: 'skill',
      }),
    ).toThrow('toolCallId');
  });

  it('marks same-producer tool provenance as non-independent', () => {
    const resolved = createNativeToolEvidence({
      toolCallId: 'call-self-1',
      toolAgentId: 'producer-agent',
      producerAgentId: 'producer-agent',
      criterionId: 'target',
      value: 'skill',
    });

    expect(resolved.independent).toBe(false);
    expect(resolved.evidence.source.agentId).toBe('producer-agent');
  });

  it('does not infer evidence value or criterion from raw tool output', () => {
    const resolved = createNativeToolEvidence({
      toolCallId: 'call-explicit-1',
      producerAgentId: 'producer-agent',
      criterionId: 'target',
      value: 'workflow',
    });

    expect(resolved.evidence).toEqual({
      id: 'call-explicit-1',
      criterionId: 'target',
      value: 'workflow',
      source: { id: 'call-explicit-1', type: 'tool' },
    });
    expect(resolved.provenance).toEqual({ toolCallId: 'call-explicit-1' });
  });
});
