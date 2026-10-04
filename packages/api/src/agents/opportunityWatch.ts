import {
  deduplicateOpportunitySignals,
  normalizeOpportunitySignal,
  opportunitySignalKey,
  type OpportunitySignal,
} from './opportunity';

export type EconomicOpportunityStatus = 'NEW' | 'ACTIVE' | 'STALE' | 'EXPIRED' | 'REJECTED';

export interface EconomicOpportunityRecord {
  opportunityKey: string;
  signal: OpportunitySignal;
  status: EconomicOpportunityStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  lastVerifiedAt?: string;
  estimatedValue?: number;
  estimatedCosts?: number;
  estimatedNetValue?: number;
  valueCurrency?: string;
  sourceRef: string;
  evidenceRefs: readonly string[];
}

export interface OpportunityWatchObservation {
  signal: OpportunitySignal;
  checkedAt: string;
  sourceRef: string;
  evidenceRefs?: readonly string[];
  status?: Exclude<EconomicOpportunityStatus, 'NEW'>;
  estimatedValue?: number;
  estimatedCosts?: number;
  valueCurrency?: string;
}

const MAX_OBSERVATIONS = 100;

export class OpportunityWatchRegistry {
  private readonly records = new Map<string, EconomicOpportunityRecord>();

  upsert(observation: OpportunityWatchObservation): EconomicOpportunityRecord {
    if (!observation.sourceRef.trim()) throw new Error('Opportunity watch sourceRef is required');
    if (!Number.isFinite(Date.parse(observation.checkedAt))) {
      throw new Error('Opportunity watch checkedAt must be a valid date');
    }
    const signal = normalizeOpportunitySignal(observation.signal);
    const key = opportunitySignalKey(signal);
    const existing = this.records.get(key);
    const estimatedValue = observation.estimatedValue;
    const estimatedCosts = observation.estimatedCosts;
    if (estimatedValue != null && !Number.isFinite(estimatedValue))
      throw new Error('estimatedValue must be numeric');
    if (estimatedCosts != null && !Number.isFinite(estimatedCosts))
      throw new Error('estimatedCosts must be numeric');
    const resolvedValue = estimatedValue ?? existing?.estimatedValue;
    const resolvedCosts = estimatedCosts ?? existing?.estimatedCosts;
    const next: EconomicOpportunityRecord = {
      opportunityKey: key,
      signal,
      status: observation.status ?? (existing ? 'ACTIVE' : 'NEW'),
      firstSeenAt: existing?.firstSeenAt ?? observation.checkedAt,
      lastSeenAt: observation.checkedAt,
      lastVerifiedAt: observation.checkedAt,
      sourceRef: observation.sourceRef,
      evidenceRefs: [...(observation.evidenceRefs ?? existing?.evidenceRefs ?? [])],
    };
    if (resolvedValue != null) next.estimatedValue = resolvedValue;
    if (resolvedCosts != null) next.estimatedCosts = resolvedCosts;
    const currency = observation.valueCurrency ?? existing?.valueCurrency;
    if (currency) next.valueCurrency = currency;
    if (resolvedValue != null || resolvedCosts != null) {
      next.estimatedNetValue = (resolvedValue ?? 0) - (resolvedCosts ?? 0);
    } else if (existing?.estimatedNetValue != null) {
      next.estimatedNetValue = existing.estimatedNetValue;
    }
    this.records.set(key, { ...next, evidenceRefs: [...next.evidenceRefs] });
    return { ...next, evidenceRefs: [...next.evidenceRefs] };
  }

  markMissingAsStale(
    seenKeys: ReadonlySet<string>,
    checkedAt: string,
  ): EconomicOpportunityRecord[] {
    const changed: EconomicOpportunityRecord[] = [];
    for (const [key, record] of this.records) {
      if (seenKeys.has(key) || record.status === 'EXPIRED' || record.status === 'REJECTED')
        continue;
      const next = { ...record, status: 'STALE' as const, lastVerifiedAt: checkedAt };
      this.records.set(key, next);
      changed.push({ ...next, evidenceRefs: [...next.evidenceRefs] });
    }
    return changed;
  }

  get(opportunityKey: string): EconomicOpportunityRecord | undefined {
    const record = this.records.get(opportunityKey);
    return record ? { ...record, evidenceRefs: [...record.evidenceRefs] } : undefined;
  }

  list(): EconomicOpportunityRecord[] {
    return [...this.records.values()]
      .sort((a, b) => a.opportunityKey.localeCompare(b.opportunityKey))
      .map((r) => ({ ...r, evidenceRefs: [...r.evidenceRefs] }));
  }

  size(): number {
    return this.records.size;
  }
}

export interface OpportunityWatchRunnerOptions {
  maxObservations?: number;
}

let processOpportunityWatchRunner: OpportunityWatchRunner | undefined;

export function getOpportunityWatchRunner(): OpportunityWatchRunner {
  if (!processOpportunityWatchRunner) {
    processOpportunityWatchRunner = new OpportunityWatchRunner();
  }
  return processOpportunityWatchRunner;
}

export class OpportunityWatchRunner {
  readonly registry: OpportunityWatchRegistry;
  private readonly maxObservations: number;

  constructor(
    registry: OpportunityWatchRegistry = new OpportunityWatchRegistry(),
    options: OpportunityWatchRunnerOptions = {},
  ) {
    this.registry = registry;
    this.maxObservations = Math.min(
      Number.isSafeInteger(options.maxObservations) && (options.maxObservations ?? 0) > 0
        ? options.maxObservations!
        : MAX_OBSERVATIONS,
      MAX_OBSERVATIONS,
    );
  }

  run(observations: readonly OpportunityWatchObservation[]): EconomicOpportunityRecord[] {
    if (observations.length > this.maxObservations)
      throw new Error('Opportunity watch observation limit exceeded');
    const deduped = deduplicateOpportunitySignals(observations.map((o) => o.signal));
    const byKey = new Map(deduped.map((signal) => [opportunitySignalKey(signal), signal]));
    const updates: EconomicOpportunityRecord[] = [];
    const seen = new Set<string>();
    for (const observation of observations) {
      const key = opportunitySignalKey(observation.signal);
      if (!byKey.has(key) || seen.has(key)) continue;
      seen.add(key);
      updates.push(this.registry.upsert(observation));
    }
    const checkedAt = observations[0]?.checkedAt ?? new Date().toISOString();
    updates.push(...this.registry.markMissingAsStale(seen, checkedAt));
    return updates;
  }
}
