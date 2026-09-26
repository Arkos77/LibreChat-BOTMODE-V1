import { collectIndependentImprovementEvidence, resolveImprovementEvidence } from './evidence';

describe('P10 improvement evidence contract', () => {
  it('normalizes source-addressed tool evidence without inventing authority', () => {
    const resolved = resolveImprovementEvidence({
      id: 'evidence-tool-1',
      criterionId: 'target',
      value: 'skill',
      source: { id: 'tool-call-1', type: 'tool', agentId: 'verifier-agent' },
      producerAgentId: 'producer-agent',
      requireIndependentEvidence: true,
    });

    expect(resolved).toEqual({
      independent: true,
      evidence: {
        id: 'evidence-tool-1',
        criterionId: 'target',
        value: 'skill',
        source: { id: 'tool-call-1', type: 'tool', agentId: 'verifier-agent' },
      },
    });
    expect(resolved).not.toHaveProperty('authorized');
    expect(resolved).not.toHaveProperty('publishable');
    expect(resolved).not.toHaveProperty('verdict');
  });

  it('fails closed when producer evidence is the only evidence for an independent criterion', () => {
    expect(() =>
      resolveImprovementEvidence({
        id: 'evidence-producer-1',
        criterionId: 'target',
        value: 'skill',
        source: { id: 'producer-claim-1', type: 'producer', agentId: 'producer-agent' },
        producerAgentId: 'producer-agent',
        requireIndependentEvidence: true,
      }),
    ).toThrow('independent evidence is required');
  });

  it('fails closed when another source is still owned by the producing agent', () => {
    expect(() =>
      resolveImprovementEvidence({
        id: 'evidence-model-1',
        criterionId: 'target',
        value: 'skill',
        source: { id: 'model-check-1', type: 'model', agentId: 'producer-agent' },
        producerAgentId: 'producer-agent',
        requireIndependentEvidence: true,
      }),
    ).toThrow('independent evidence is required');
  });

  it('collects only evidence that satisfies the independent boundary', () => {
    expect(
      collectIndependentImprovementEvidence([
        {
          id: 'evidence-source-1',
          criterionId: 'target',
          value: 'workflow',
          source: { id: 'source-doc-1', type: 'source' },
          producerAgentId: 'producer-agent',
        },
        {
          id: 'evidence-tool-2',
          criterionId: 'target',
          value: 'workflow',
          source: { id: 'tool-call-2', type: 'tool', agentId: 'reviewer-agent' },
          producerAgentId: 'producer-agent',
        },
      ]),
    ).toEqual([
      {
        id: 'evidence-source-1',
        criterionId: 'target',
        value: 'workflow',
        source: { id: 'source-doc-1', type: 'source' },
      },
      {
        id: 'evidence-tool-2',
        criterionId: 'target',
        value: 'workflow',
        source: { id: 'tool-call-2', type: 'tool', agentId: 'reviewer-agent' },
      },
    ]);
  });

  it('rejects missing provenance identity', () => {
    expect(() =>
      resolveImprovementEvidence({
        id: 'evidence-bad',
        criterionId: 'target',
        value: 'skill',
        source: { id: ' ', type: 'tool' },
        producerAgentId: 'producer-agent',
      }),
    ).toThrow('source.id');
  });
});
