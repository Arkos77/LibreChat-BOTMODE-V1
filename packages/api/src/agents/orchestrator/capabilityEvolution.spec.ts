import {
  capabilityEvolutionStages,
  createCapabilityEvolutionCandidate,
} from './capabilityEvolution';

describe('capability evolution contract', () => {
  const base: import('./capabilityEvolution').CapabilityEvolutionCandidate = {
    resourceId: 'resource:test',
    stage: 'DISCOVER',
    status: 'CANDIDATE',
    sourceRefs: ['source:test'],
    capabilityIds: ['capability:test'],
    evidenceRefs: [],
    blockers: [],
  };

  it('keeps the full bounded evolution stage sequence explicit', () => {
    expect(capabilityEvolutionStages).toEqual([
      'DISCOVER',
      'EXTRACT_CAPABILITY',
      'ARCHITECTURE_MAPPING',
      'GAP_ANALYSIS',
      'DUPLICATION_ANALYSIS',
      'COMPATIBILITY',
      'LICENSE',
      'MATURITY',
      'VALUE',
      'COST',
      'RISK',
      'SANDBOX',
      'BENCHMARK',
      'ORACLE',
      'PROPOSAL',
    ]);
  });

  it('normalizes bounded metadata without creating authority', () => {
    expect(createCapabilityEvolutionCandidate(base)).toEqual(base);
  });

  it('requires non-empty provenance and capability identities', () => {
    expect(() => createCapabilityEvolutionCandidate({ ...base, sourceRefs: [] })).toThrow(
      /sourceRefs/,
    );
    expect(() => createCapabilityEvolutionCandidate({ ...base, capabilityIds: [] })).toThrow(
      /capabilityIds/,
    );
  });

  it('rejects an approved candidate before the proposal stage', () => {
    expect(() =>
      createCapabilityEvolutionCandidate({
        ...base,
        status: 'APPROVED',
        stage: 'ORACLE',
        evidenceRefs: ['evidence:test'],
      }),
    ).toThrow(/proposal/);
  });

  it('requires evidence and no blockers for an approved proposal', () => {
    expect(() =>
      createCapabilityEvolutionCandidate({ ...base, status: 'APPROVED', stage: 'PROPOSAL' }),
    ).toThrow(/evidence/);
    expect(() =>
      createCapabilityEvolutionCandidate({
        ...base,
        status: 'APPROVED',
        stage: 'PROPOSAL',
        evidenceRefs: ['evidence:test'],
        blockers: ['blocked'],
      }),
    ).toThrow(/unblocked/);
    expect(
      createCapabilityEvolutionCandidate({
        ...base,
        status: 'APPROVED',
        stage: 'PROPOSAL',
        evidenceRefs: ['evidence:test'],
      }),
    ).toMatchObject({ status: 'APPROVED', stage: 'PROPOSAL' });
  });
});
