import type { OracleDecision, OracleEvent, OracleStatus } from '~/agents/oracle';

type TerminalOracleResult = Extract<OracleEvent, { verdict: unknown }>;

export type SynthesisReadinessStatus =
  | 'READY'
  | 'BLOCKED_MISSING_VERDICT'
  | 'BLOCKED_REJECTED'
  | 'BLOCKED_UNKNOWN'
  | 'BLOCKED_HUMAN_REVIEW';

export interface RequiredOracleTask {
  taskId: string;
  nodeId: string;
}

export interface TaskOracleResult {
  taskId: string;
  nodeId: string;
  oracle: TerminalOracleResult;
}

export interface SynthesisReadiness {
  ready: boolean;
  status: SynthesisReadinessStatus;
  requiredTaskIds: string[];
  verifiedTaskIds: string[];
  blockedTaskIds: string[];
}

const EXPECTED_PHASE: Record<OracleDecision, OracleStatus> = {
  ACCEPT: 'VERIFIED',
  REJECT: 'REJECTED',
  DEFER: 'UNKNOWN',
  REQUEST_HUMAN_REVIEW: 'HUMAN_REVIEW',
};

function requiredText(value: string, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Synthesis readiness requires non-empty ${name}`);
  }
  return value.trim();
}

function terminalStatus(result: TaskOracleResult): OracleStatus {
  const phase = result.oracle.phase;
  const expected = EXPECTED_PHASE[result.oracle.decision];
  if (phase !== expected || result.oracle.verdict.status !== phase) {
    throw new Error('Oracle phase, verdict status and decision must agree');
  }
  if (result.oracle.verdict.input.taskId !== result.taskId) {
    throw new Error('Oracle verdict task identity does not match synthesis task');
  }
  return phase;
}

/**
 * Pure QA gate for final/critical synthesis.
 *
 * It does not execute, authorize, settle, persist, interrupt or mutate a run.
 * A host may use `ready` to decide whether a critical synthesis is admissible.
 */
export function evaluateSynthesisReadiness(
  required: readonly RequiredOracleTask[],
  results: readonly TaskOracleResult[],
): SynthesisReadiness {
  const normalized = required.map((item) => ({
    taskId: requiredText(item.taskId, 'taskId'),
    nodeId: requiredText(item.nodeId, 'nodeId'),
  }));

  if (
    new Set(normalized.map((item) => item.taskId)).size !== normalized.length ||
    new Set(normalized.map((item) => item.nodeId)).size !== normalized.length
  ) {
    throw new Error('Synthesis readiness requires unique task and node identities');
  }

  const byTask = new Map<string, TaskOracleResult>();
  for (const result of results) {
    const taskId = requiredText(result.taskId, 'result taskId');
    const nodeId = requiredText(result.nodeId, 'result nodeId');
    if (byTask.has(taskId)) {
      throw new Error('Synthesis readiness received duplicate Oracle results');
    }
    byTask.set(taskId, { ...result, taskId, nodeId });
  }

  const verifiedTaskIds: string[] = [];
  const blockedTaskIds: string[] = [];
  let status: SynthesisReadinessStatus = 'READY';

  for (const item of normalized) {
    const result = byTask.get(item.taskId);
    if (!result) {
      blockedTaskIds.push(item.taskId);
      if (status === 'READY') status = 'BLOCKED_MISSING_VERDICT';
      continue;
    }
    if (result.nodeId !== item.nodeId) {
      throw new Error('Oracle result node identity does not match synthesis task');
    }

    const phase = terminalStatus(result);
    if (phase === 'VERIFIED') {
      verifiedTaskIds.push(item.taskId);
      continue;
    }

    blockedTaskIds.push(item.taskId);
    if (phase === 'HUMAN_REVIEW') {
      status = 'BLOCKED_HUMAN_REVIEW';
    } else if (phase === 'REJECTED' && status !== 'BLOCKED_HUMAN_REVIEW') {
      status = 'BLOCKED_REJECTED';
    } else if (
      phase === 'UNKNOWN' &&
      status !== 'BLOCKED_HUMAN_REVIEW' &&
      status !== 'BLOCKED_REJECTED'
    ) {
      status = 'BLOCKED_UNKNOWN';
    }
  }

  return {
    ready: blockedTaskIds.length === 0,
    status,
    requiredTaskIds: normalized.map((item) => item.taskId),
    verifiedTaskIds,
    blockedTaskIds,
  };
}
