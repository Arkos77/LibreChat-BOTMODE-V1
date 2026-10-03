export interface ImprovementOutcome {
  candidateId: string;
  traceId: string;
  taskId: string;
  operation: 'CREATE' | 'UPDATE';
  outcome: 'SUCCESS' | 'FAILED' | 'ROLLED_BACK' | 'NO_EFFECT';
  benchmarkScore?: number;
  baselineScore?: number;
  durationMs?: number;
  errorCode?: string;
  evidenceRefs: readonly string[];
  observedAt: string;
}

export type ImprovementFeedbackSignal = 'IMPROVED' | 'REGRESSED' | 'UNCHANGED' | 'INCONCLUSIVE';

export interface ImprovementFeedbackSummary {
  signal: ImprovementFeedbackSignal;
  sampleCount: number;
  successCount: number;
  failureCount: number;
  regressionCount: number;
  averageDelta?: number;
  evidenceRefs: readonly string[];
}

function requiredText(name: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} must be non-empty`);
  return value.trim();
}

function validNumber(name: string, value: number | undefined): void {
  if (value !== undefined && !Number.isFinite(value)) throw new Error(`${name} must be finite`);
}

function validDate(name: string, value: string): void {
  requiredText(name, value);
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${name} must be a valid date`);
}

export function validateImprovementOutcome(outcome: ImprovementOutcome): ImprovementOutcome {
  requiredText('candidateId', outcome.candidateId);
  requiredText('traceId', outcome.traceId);
  requiredText('taskId', outcome.taskId);
  validNumber('benchmarkScore', outcome.benchmarkScore);
  validNumber('baselineScore', outcome.baselineScore);
  if (outcome.durationMs !== undefined && (!Number.isFinite(outcome.durationMs) || outcome.durationMs < 0)) throw new Error('durationMs must be non-negative');
  if (outcome.evidenceRefs.some((ref) => !ref)) throw new Error('evidence refs must be non-empty');
  if (outcome.outcome === 'SUCCESS' && outcome.errorCode) throw new Error('successful outcome cannot carry an error code');
  if (outcome.benchmarkScore !== undefined && (outcome.benchmarkScore < 0 || outcome.benchmarkScore > 1)) throw new Error('benchmarkScore must be between 0 and 1');
  if (outcome.baselineScore !== undefined && (outcome.baselineScore < 0 || outcome.baselineScore > 1)) throw new Error('baselineScore must be between 0 and 1');
  validDate('observedAt', outcome.observedAt);
  return { ...outcome, evidenceRefs: [...outcome.evidenceRefs] };
}

export function summarizeImprovementFeedback(outcomes: readonly ImprovementOutcome[]): ImprovementFeedbackSummary {
  if (outcomes.length === 0) throw new Error('Improvement feedback requires at least one outcome');
  outcomes.forEach(validateImprovementOutcome);
  const deltas = outcomes.filter((o) => o.benchmarkScore !== undefined && o.baselineScore !== undefined).map((o) => (o.benchmarkScore as number) - (o.baselineScore as number));
  const successCount = outcomes.filter((o) => o.outcome === 'SUCCESS').length;
  const failureCount = outcomes.filter((o) => o.outcome === 'FAILED' || o.outcome === 'ROLLED_BACK').length;
  const regressionCount = deltas.filter((d) => d < 0).length;
  const averageDelta = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : undefined;
  let signal: ImprovementFeedbackSignal = 'INCONCLUSIVE';
  if (regressionCount > 0) signal = 'REGRESSED';
  else if (deltas.length > 0 && (averageDelta as number) > 0) signal = 'IMPROVED';
  else if (deltas.length > 0 && averageDelta === 0) signal = 'UNCHANGED';
  else if (successCount === outcomes.length) signal = 'UNCHANGED';
  return { signal, sampleCount: outcomes.length, successCount, failureCount, regressionCount, ...(averageDelta === undefined ? {} : { averageDelta }), evidenceRefs: [...new Set(outcomes.flatMap((o) => o.evidenceRefs))] };
}
