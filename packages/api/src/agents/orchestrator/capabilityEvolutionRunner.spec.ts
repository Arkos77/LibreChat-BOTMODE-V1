import { CapabilityEvolutionRunner } from './capabilityEvolutionRunner';
import type { CapabilityEvaluation } from './capabilityEvaluation';

describe('capability evolution runner', () => {
  const approved: CapabilityEvaluation = {
    resourceId: 'resource:approved',
    status: 'APPROVED',
    availability: 'AVAILABLE',
    api: 'PRESENT',
    license: 'COMPATIBLE',
    pricing: 'FREE',
    security: 'ACCEPTED',
    privacy: 'LOCAL',
    compatibility: 'COMPATIBLE',
    maturity: 'STABLE',
    evidenceRefs: ['evidence:approved'],
    evaluatedAt: '2026-10-04T00:00:00.000Z',
  };

  const rejected: CapabilityEvaluation = {
    ...approved,
    resourceId: 'resource:rejected',
    status: 'REJECTED',
    security: 'REJECTED',
    evidenceRefs: ['evidence:rejected'],
  };

  const discovery = {
    resourceId: 'resource:approved',
    sourceRefs: ['source:test'],
    capabilityIds: ['capability:test'],
  };

  it('turns an approved evaluation into a bounded proposal', async () => {
    const evaluate = jest.fn(async () => approved);
    const runner = new CapabilityEvolutionRunner(evaluate);
    await expect(runner.evaluateCandidates([discovery])).resolves.toMatchObject([
      {
        candidate: {
          stage: 'PROPOSAL',
          status: 'APPROVED',
          blockers: [],
          evidenceRefs: ['evidence:approved'],
        },
        evaluation: approved,
      },
    ]);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it('does not emit a proposal for rejected evaluation', async () => {
    const runner = new CapabilityEvolutionRunner(async () => rejected);
    await expect(
      runner.evaluateCandidates([{ ...discovery, resourceId: 'resource:rejected' }]),
    ).resolves.toEqual([]);
  });

  it('enforces the candidate fan-out bound', async () => {
    const runner = new CapabilityEvolutionRunner(async () => approved, { maxCandidates: 2 });
    const many = Array.from({ length: 3 }, (_, index) => ({
      resourceId: `resource:${index}`,
      sourceRefs: [`source:${index}`],
      capabilityIds: [`capability:${index}`],
    }));
    await expect(runner.evaluateCandidates(many)).rejects.toThrow(/limit exceeded/);
  });

  it('keeps evaluation separate from authorization or persistence', async () => {
    const runner = new CapabilityEvolutionRunner(async () => approved);
    const proposals = await runner.evaluateCandidates([discovery]);
    expect(proposals[0].candidate.status).toBe('APPROVED');
    expect(proposals[0].candidate.stage).toBe('PROPOSAL');
    expect(proposals[0].candidate).not.toHaveProperty('authorization');
    expect(proposals[0].candidate).not.toHaveProperty('persist');
  });
});
