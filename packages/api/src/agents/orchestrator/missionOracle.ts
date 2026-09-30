import type { BaseMessage } from '@librechat/agents/langchain/messages';
import type { OracleEvidence, OracleVerdict } from '../oracle';
import type { MissionPlan, OracleRequirement } from './types';
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
      evidence: [],
    });
    assertMissionTaskVerified(result);
  }
}
