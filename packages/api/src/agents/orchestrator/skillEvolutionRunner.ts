import type { MtoEvent } from './mto';
import {
  createImprovementCandidate,
  type ImprovementCandidate,
} from './improvement';
import {
  summarizeImprovementFeedback,
  type ImprovementOutcome,
  type ImprovementFeedbackSummary,
} from './improvementFeedback';

export interface SkillEvolutionRunInput {
  candidateId: string;
  traceId: string;
  title: string;
  summary: string;
  observations: readonly MtoEvent[];
  outcomes: readonly ImprovementOutcome[];
  payloadDigest: string;
  requiresHumanReview?: boolean;
}

export interface SkillEvolutionRunResult {
  feedback: ImprovementFeedbackSummary;
  candidate?: ImprovementCandidate;
  decision: 'PROPOSE' | 'HOLD';
  reason: 'IMPROVED' | 'REGRESSED' | 'UNCHANGED' | 'INCONCLUSIVE';
}

export interface SkillEvolutionRunnerOptions {
  maxObservations?: number;
  maxOutcomes?: number;
}

const DEFAULT_MAX_OBSERVATIONS = 100;
const DEFAULT_MAX_OUTCOMES = 50;

function bounded(value: number | undefined, fallback: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value == null || value < 1) return fallback;
  return Math.min(value, maximum);
}

/**
 * Autonomous feedback loop at proposal level only.
 * It observes existing traces/outcomes and may emit a candidate; authorization,
 * persistence and publication stay with the native host controls.
 */
export class SkillEvolutionRunner {
  private readonly maxObservations: number;
  private readonly maxOutcomes: number;

  constructor(options: SkillEvolutionRunnerOptions = {}) {
    this.maxObservations = bounded(
      options.maxObservations,
      DEFAULT_MAX_OBSERVATIONS,
      DEFAULT_MAX_OBSERVATIONS,
    );
    this.maxOutcomes = bounded(
      options.maxOutcomes,
      DEFAULT_MAX_OUTCOMES,
      DEFAULT_MAX_OUTCOMES,
    );
  }

  run(input: SkillEvolutionRunInput): SkillEvolutionRunResult {
    if (input.observations.length === 0) {
      throw new Error('Skill evolution requires at least one observation');
    }
    if (input.observations.length > this.maxObservations) {
      throw new Error('Skill evolution observation limit exceeded');
    }
    if (input.outcomes.length === 0) {
      throw new Error('Skill evolution requires at least one improvement outcome');
    }
    if (input.outcomes.length > this.maxOutcomes) {
      throw new Error('Skill evolution outcome limit exceeded');
    }

    const feedback = summarizeImprovementFeedback(input.outcomes);
    const decision = feedback.signal === 'IMPROVED' ? 'PROPOSE' : 'HOLD';
    if (decision === 'HOLD') {
      return {
        feedback,
        decision,
        reason: feedback.signal,
      };
    }

    const candidate = createImprovementCandidate({
      candidateId: input.candidateId,
      target: 'skill',
      title: input.title,
      summary: input.summary,
      traceId: input.traceId,
      observations: input.observations,
      payloadDigest: input.payloadDigest,
      requiresHumanReview: input.requiresHumanReview,
    });

    return {
      feedback,
      candidate,
      decision,
      reason: feedback.signal,
    };
  }
}
