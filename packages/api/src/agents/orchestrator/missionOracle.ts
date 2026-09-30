import type { BaseMessage } from '@librechat/agents/langchain/messages';
import type { TransientToolEvidenceObservation } from './transientEvidenceBuffer';
import type { OracleEvidence, OracleVerdict } from '../oracle';
import type { MissionPlan, OracleRequirement } from './types';
import { createNativeToolEvidence } from './toolEvidence';
import { deterministicOracle } from '../oracle';

export interface MissionOracleTaskInput {
  taskId: string;
  nodeId: string;
  agentId: string;
  candidate?: string;
  requirements: readonly OracleRequirement[];
  evidence?: readonly OracleEvidence[];
}

export interface MissionOracleTaskResult {
  taskId: string;
  nodeId: string;
  verdicts: OracleVerdict[];
}

/** Durable host-owned QA execution state. Evidence/verdict state only; it is
 * not part of MissionPlan and grants no execution authorization. */
export interface MissionOracleState {
  evidence: Record<string, OracleEvidence[]>;
  results: Record<string, MissionOracleTaskResult>;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function requireDurableState(condition: unknown, detail: string): asserts condition {
  if (!condition) {
    throw new Error(`Mission Oracle durable state invalid: ${detail}`);
  }
}

function isOracleScalar(value: unknown): value is string | number | boolean | null {
  return (
    value == null ||
    typeof value === 'string' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    typeof value === 'boolean'
  );
}

function validateEvidence(value: unknown, path: string): void {
  requireDurableState(isPlainRecord(value), `${path} must be an object`);
  requireDurableState(typeof value.id === 'string' && value.id.trim() !== '', `${path}.id`);
  requireDurableState(
    typeof value.criterionId === 'string' && value.criterionId.trim() !== '',
    `${path}.criterionId`,
  );
  requireDurableState(isOracleScalar(value.value), `${path}.value`);
  requireDurableState(isPlainRecord(value.source), `${path}.source`);
  requireDurableState(
    typeof value.source.id === 'string' && value.source.id.trim() !== '',
    `${path}.source.id`,
  );
  requireDurableState(
    ['tool', 'source', 'model', 'producer'].includes(String(value.source.type)),
    `${path}.source.type`,
  );
  if (value.source.agentId != null) {
    requireDurableState(
      typeof value.source.agentId === 'string' && value.source.agentId.trim() !== '',
      `${path}.source.agentId`,
    );
  }
  if (value.confidence != null) {
    requireDurableState(
      typeof value.confidence === 'number' &&
        Number.isFinite(value.confidence) &&
        value.confidence >= 0 &&
        value.confidence <= 1,
      `${path}.confidence`,
    );
  }
}

function validateVerdict(value: unknown, path: string): void {
  requireDurableState(isPlainRecord(value), `${path} must be an object`);
  requireDurableState(
    ['VERIFIED', 'REJECTED', 'UNKNOWN', 'HUMAN_REVIEW'].includes(String(value.status)),
    `${path}.status`,
  );
  requireDurableState(isPlainRecord(value.input), `${path}.input`);
  requireDurableState(
    typeof value.input.taskId === 'string' && value.input.taskId.trim() !== '',
    `${path}.input.taskId`,
  );
  requireDurableState(
    typeof value.input.agentId === 'string' && value.input.agentId.trim() !== '',
    `${path}.input.agentId`,
  );
  requireDurableState(Array.isArray(value.input.criteria), `${path}.input.criteria`);
  requireDurableState(Array.isArray(value.input.evidence), `${path}.input.evidence`);
  for (const [index, evidence] of value.input.evidence.entries()) {
    validateEvidence(evidence, `${path}.input.evidence[${index}]`);
  }
  requireDurableState(Array.isArray(value.reasons), `${path}.reasons`);
  requireDurableState(Array.isArray(value.checks), `${path}.checks`);
  requireDurableState(Array.isArray(value.contradictions), `${path}.contradictions`);
  requireDurableState(Array.isArray(value.uncertainty), `${path}.uncertainty`);
  requireDurableState(isPlainRecord(value.validator), `${path}.validator`);
  requireDurableState(
    typeof value.validator.id === 'string' && value.validator.id.trim() !== '',
    `${path}.validator.id`,
  );
  requireDurableState(
    ['deterministic', 'tool', 'source', 'model', 'human'].includes(String(value.validator.type)),
    `${path}.validator.type`,
  );
  requireDurableState(
    typeof value.timestamp === 'string' &&
      value.timestamp.trim() !== '' &&
      Number.isFinite(Date.parse(value.timestamp)),
    `${path}.timestamp`,
  );
}

function emptyMissionOracleState(): MissionOracleState {
  return { evidence: {}, results: {} };
}

function missionTaskCriterionIds(plan: MissionPlan, taskId: string): Set<string> {
  const task = plan.tasks.find((candidate) => candidate.taskId === taskId);
  if (task == null) {
    throw new Error(`Mission Oracle evidence references unknown task: ${taskId}`);
  }
  return new Set(
    task.validation.flatMap((requirement) =>
      requirement.criteria.map((criterion) => requiredText(criterion.id, 'criterionId')),
    ),
  );
}

function sameEvidence(left: OracleEvidence, right: OracleEvidence): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Promotes only already-declared structured native tool observations into
 * durable host-owned Oracle evidence. No tool output, arguments, artifacts or
 * model prose are inspected here.
 */
export function promoteTransientMissionOracleEvidence(
  plan: MissionPlan,
  state: MissionOracleState | undefined,
  observation: TransientToolEvidenceObservation,
): MissionOracleState {
  if (observation.source !== 'native_tool_end') {
    throw new Error('Mission Oracle evidence requires native_tool_end observation');
  }
  const taskId = requiredText(observation.taskId ?? '', 'taskId');
  const criterionId = requiredText(observation.criterionId ?? '', 'criterionId');
  if (!Object.prototype.hasOwnProperty.call(observation, 'value')) {
    throw new Error('Mission Oracle evidence requires explicit value');
  }

  const declaredCriteria = missionTaskCriterionIds(plan, taskId);
  if (!declaredCriteria.has(criterionId)) {
    throw new Error(
      `Mission Oracle evidence criterion ${criterionId} is not declared for task ${taskId}`,
    );
  }

  const nextState = state == null ? emptyMissionOracleState() : normalizeMissionOracleState(state);
  const { evidence } = createNativeToolEvidence({
    toolCallId: observation.toolCallId,
    producerAgentId: observation.producerAgentId,
    criterionId,
    value: observation.value,
    ...(observation.toolAgentId == null ? {} : { toolAgentId: observation.toolAgentId }),
    ...(observation.runId == null ? {} : { runId: observation.runId }),
  });

  const bucket = nextState.evidence[taskId] ?? [];
  const existing = bucket.find((candidate) => candidate.id === evidence.id);
  if (existing != null) {
    if (!sameEvidence(existing, evidence)) {
      throw new Error(`Mission Oracle evidence replay conflict for task ${taskId}: ${evidence.id}`);
    }
    return nextState;
  }

  nextState.evidence[taskId] = [...bucket, evidence];
  return nextState;
}

export function normalizeMissionOracleState(value: unknown): MissionOracleState {
  requireDurableState(isPlainRecord(value), 'root must be an object');
  requireDurableState(isPlainRecord(value.evidence), 'evidence must be an object');
  requireDurableState(isPlainRecord(value.results), 'results must be an object');

  for (const [taskId, evidenceList] of Object.entries(value.evidence)) {
    requireDurableState(taskId.trim() !== '', 'evidence task key');
    requireDurableState(Array.isArray(evidenceList), `evidence.${taskId} must be an array`);
    for (const [index, evidence] of evidenceList.entries()) {
      validateEvidence(evidence, `evidence.${taskId}[${index}]`);
    }
  }

  for (const [taskId, result] of Object.entries(value.results)) {
    requireDurableState(taskId.trim() !== '', 'results task key');
    requireDurableState(isPlainRecord(result), `results.${taskId} must be an object`);
    requireDurableState(
      typeof result.taskId === 'string' && result.taskId.trim() !== '',
      `results.${taskId}.taskId`,
    );
    requireDurableState(result.taskId === taskId, `results.${taskId}.taskId mismatch`);
    requireDurableState(
      typeof result.nodeId === 'string' && result.nodeId.trim() !== '',
      `results.${taskId}.nodeId`,
    );
    requireDurableState(Array.isArray(result.verdicts), `results.${taskId}.verdicts`);
    for (const [index, verdict] of result.verdicts.entries()) {
      validateVerdict(verdict, `results.${taskId}.verdicts[${index}]`);
    }
  }

  return structuredClone(value) as MissionOracleState;
}

function requiredText(value: string, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Mission Oracle requires non-empty ${name}`);
  }
  return value.trim();
}

/**
 * Runtime QA only. Requirements remain host-owned; evidence is supplied explicitly
 * by the caller. This function neither authorizes execution nor mutates task state.
 */
export async function validateMissionTask(
  input: MissionOracleTaskInput,
): Promise<MissionOracleTaskResult> {
  const taskId = requiredText(input.taskId, 'taskId');
  const nodeId = requiredText(input.nodeId, 'nodeId');
  const agentId = requiredText(input.agentId, 'agentId');
  const evidence = input.evidence == null ? [] : [...input.evidence];

  const verdicts: OracleVerdict[] = [];
  for (const requirement of input.requirements) {
    const criteria = requirement.criteria.map((criterion) =>
      requirement.requireIndependentEvidence === true
        ? { ...criterion, requireEvidence: true }
        : { ...criterion },
    );
    const verdict = await deterministicOracle.validate({
      taskId,
      agentId,
      candidate: input.candidate,
      criteria,
      evidence,
      ...(requirement.review == null ? {} : { review: structuredClone(requirement.review) }),
    });
    verdicts.push(verdict);
  }

  return { taskId, nodeId, verdicts };
}

export function assertMissionTaskVerified(result: MissionOracleTaskResult): void {
  const blocked = result.verdicts.find((verdict) => verdict.status !== 'VERIFIED');
  if (blocked != null) {
    throw new Error(
      `Native mission Oracle blocked task ${result.taskId} (${result.nodeId}): ${blocked.status}`,
    );
  }
}

function messageCandidate(output: BaseMessage | undefined): string | undefined {
  return typeof output?.content === 'string' && output.content.trim() !== ''
    ? output.content
    : undefined;
}

export async function assertTerminalMissionTasksVerified(
  plan: MissionPlan,
  outputs: Record<string, BaseMessage>,
  state?: MissionOracleState,
): Promise<void> {
  const dependedOnKeys = new Set(plan.tasks.flatMap((task) => task.dependsOn));
  const terminalTasks = plan.tasks.filter((task) => !dependedOnKeys.has(task.key));

  for (const task of terminalTasks) {
    if (task.validation.length === 0) {
      continue;
    }
    const output = outputs[task.nodeId];
    if (output == null) {
      throw new Error(`Native mission terminal Oracle missing exact task output: ${task.nodeId}`);
    }
    const result = await validateMissionTask({
      taskId: task.taskId,
      nodeId: task.nodeId,
      agentId: task.agentId,
      candidate: messageCandidate(output),
      requirements: task.validation,
      evidence: state?.evidence[task.taskId] ?? [],
    });
    assertMissionTaskVerified(result);
  }
}
