import type { CapabilityResourceRegistry } from './capabilityRegistry';
import {
  applyModelWatchObservations,
  type ModelWatchObservation,
  type ModelWatchUpdate,
} from './modelWatch';

export type ModelWatchDiscovery = () =>
  | Promise<readonly ModelWatchObservation[]>
  | readonly ModelWatchObservation[];

export interface ModelWatchRunnerOptions {
  maxObservations?: number;
}

export interface ModelWatchRunResult {
  checkedAt: string;
  observations: number;
  updates: readonly ModelWatchUpdate[];
}

const DEFAULT_MAX_OBSERVATIONS = 100;

function positiveBound(value: number | undefined): number {
  if (!Number.isSafeInteger(value) || value == null || value <= 0) return DEFAULT_MAX_OBSERVATIONS;
  return Math.min(value, DEFAULT_MAX_OBSERVATIONS);
}

/**
 * Host-owned model/provider watch pass. The runner only converts fresh host
 * observations into registry state; discovery, credentials, network access,
 * authorization, persistence and scheduling remain external responsibilities.
 */
export class ModelWatchRunner {
  private readonly maxObservations: number;

  constructor(
    private readonly registry: CapabilityResourceRegistry,
    private readonly discover: ModelWatchDiscovery,
    options: ModelWatchRunnerOptions = {},
  ) {
    this.maxObservations = positiveBound(options.maxObservations);
  }

  async run(): Promise<ModelWatchRunResult> {
    const checkedAt = new Date().toISOString();
    const observations = await this.discover();
    if (observations.length > this.maxObservations) {
      throw new Error('Model watch discovery limit exceeded');
    }

    const updates = applyModelWatchObservations(this.registry, observations);
    return {
      checkedAt,
      observations: observations.length,
      updates,
    };
  }
}
