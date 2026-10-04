import {
  createCapabilityEvolutionCandidate,
  type CapabilityEvolutionCandidate,
} from './capabilityEvolution';
import { validateCapabilityEvaluation, type CapabilityEvaluation } from './capabilityEvaluation';

export interface CapabilityEvolutionDiscovery {
  resourceId: string;
  sourceRefs: readonly string[];
  capabilityIds: readonly string[];
}

export type CapabilityEvolutionEvaluator = (
  discovery: CapabilityEvolutionDiscovery,
) => Promise<CapabilityEvaluation>;

export interface CapabilityEvolutionRunnerOptions {
  maxCandidates?: number;
}

export interface CapabilityEvolutionProposal {
  candidate: CapabilityEvolutionCandidate;
  evaluation: CapabilityEvaluation;
}

const DEFAULT_MAX_CANDIDATES = 20;

function boundedPositive(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && value != null && value > 0 ? value : fallback;
}

/**
 * Host-owned bounded evolution pass. It may discover/evaluate candidates and
 * produce proposals, but it never authorizes, persists, schedules, mutates or
 * publishes a capability.
 */
export class CapabilityEvolutionRunner {
  private readonly maxCandidates: number;

  constructor(
    private readonly evaluate: CapabilityEvolutionEvaluator,
    options: CapabilityEvolutionRunnerOptions = {},
  ) {
    this.maxCandidates = Math.min(
      boundedPositive(options.maxCandidates, DEFAULT_MAX_CANDIDATES),
      DEFAULT_MAX_CANDIDATES,
    );
  }

  async evaluateCandidates(
    discoveries: readonly CapabilityEvolutionDiscovery[],
  ): Promise<CapabilityEvolutionProposal[]> {
    if (discoveries.length > this.maxCandidates) {
      throw new Error('Capability evolution candidate limit exceeded');
    }

    const proposals: CapabilityEvolutionProposal[] = [];

    for (const discovery of discoveries) {
      const evaluation = await this.evaluate(discovery);
      validateCapabilityEvaluation(evaluation);

      const approved = evaluation.status === 'APPROVED';
      let stage: 'PROPOSAL' | 'ORACLE' | 'BENCHMARK' = 'BENCHMARK';
      if (approved) {
        stage = 'PROPOSAL';
      } else if (evaluation.status === 'REJECTED') {
        stage = 'ORACLE';
      }

      const blockers: string[] = [];
      if (!approved && evaluation.security === 'REVIEW_REQUIRED') {
        blockers.push('security-review-required');
      }

      const candidate = createCapabilityEvolutionCandidate({
        resourceId: discovery.resourceId,
        stage,
        status: approved ? 'APPROVED' : 'EVALUATED',
        sourceRefs: discovery.sourceRefs,
        capabilityIds: discovery.capabilityIds,
        evidenceRefs: evaluation.evidenceRefs,
        blockers,
        ...(approved ? { proposedAt: evaluation.evaluatedAt ?? new Date().toISOString() } : {}),
      });

      if (approved) {
        proposals.push({ candidate, evaluation });
      }
    }

    return proposals;
  }
}
