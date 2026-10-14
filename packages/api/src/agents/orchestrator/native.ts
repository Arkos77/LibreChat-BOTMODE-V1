import type {
  AgentInputs,
  BaseGraphState,
  MultiAgentGraphConfig,
  StandardGraphConfig,
} from '@librechat/agents';
import type { MissionOracleResultPersister, MissionOracleTaskInput } from './missionOracle';
import type { MissionPlan, OracleRequirement, PlannedTask } from './types';
import { assertMissionTaskVerified, validateMissionTask } from './missionOracle';
import { getTaskLevels, nodeIdentity } from './planner';

export interface NativeMissionPlan {
  planId: string;
  missionId: string;
  graphConfig: StandardGraphConfig | MultiAgentGraphConfig;
  actors: Array<{ nodeId: string; agentId: string; taskId: string }>;
  validation: Array<{ taskId: string; nodeId: string; requirements: OracleRequirement[] }>;
}

function messageCandidate(
  output: NonNullable<BaseGraphState['agentOutputs']>[string] | undefined,
): string | undefined {
  return typeof output?.content === 'string' && output.content.trim() !== ''
    ? output.content
    : undefined;
}

export type MissionOracleEvidenceResolver = (
  taskId: string,
) =>
  | Promise<NonNullable<MissionOracleTaskInput['evidence']>>
  | NonNullable<MissionOracleTaskInput['evidence']>;

function requirePredecessorOutputs(
  sourceTasks: readonly PlannedTask[],
  resolveMissionOracleEvidence?: MissionOracleEvidenceResolver,
  persistMissionOracleResult?: MissionOracleResultPersister,
) {
  const sourceNodeIds = sourceTasks.map((task) => task.nodeId);
  return async (state: BaseGraphState): Promise<void> => {
    const missing = sourceNodeIds.filter((nodeId) => state.agentOutputs?.[nodeId] == null);
    if (missing.length > 0) {
      throw new Error(
        `Native mission transition missing checkpointed predecessor output: ${missing.join(', ')}`,
      );
    }

    for (const task of sourceTasks) {
      if (task.validation.length === 0) {
        continue;
      }
      const result = await validateMissionTask({
        taskId: task.taskId,
        nodeId: task.nodeId,
        agentId: task.agentId,
        candidate: messageCandidate(state.agentOutputs?.[task.nodeId]),
        requirements: task.validation,
        evidence:
          resolveMissionOracleEvidence == null
            ? []
            : await resolveMissionOracleEvidence(task.taskId),
      });
      await persistMissionOracleResult?.(result);
      assertMissionTaskVerified(result);
    }
  };
}

/**
 * Compiles descriptions only. Bindings must already be resolved/authorized by
 * the host; this adapter neither grants access nor starts tasks or runs.
 * Compile options (including the existing durable checkpointer) stay host-owned.
 */
export function compileNativePlan(
  plan: MissionPlan,
  bindings: ReadonlyMap<string, AgentInputs>,
  compileOptions?: MultiAgentGraphConfig['compileOptions'],
  resolveMissionOracleEvidence?: MissionOracleEvidenceResolver,
  persistMissionOracleResult?: MissionOracleResultPersister,
): NativeMissionPlan {
  getTaskLevels(plan.tasks);
  const tasks = new Map(plan.tasks.map((task) => [task.key, task]));
  const agents = plan.tasks.map((task): AgentInputs => {
    const binding = bindings.get(task.agentId);
    if (!binding || binding.agentId !== task.agentId) {
      throw new Error(`Missing or mismatched authorized binding for ${task.agentId}`);
    }
    if (task.nodeId !== nodeIdentity(plan.mission.missionId, task.key)) {
      throw new Error('Invalid native task identity');
    }
    return {
      ...binding,
      agentId: task.nodeId,
      instructions: [
        binding.instructions,
        'Mission planning context (not execution permission):',
        JSON.stringify({
          missionId: plan.mission.missionId,
          taskId: task.taskId,
          missionObjective: plan.mission.objective,
          objective: task.objective,
          constraints: task.constraints,
          requiredCapabilities: task.requiredCapabilities,
        }),
      ]
        .filter(Boolean)
        .join('\n'),
    };
  });
  const edges: MultiAgentGraphConfig['edges'] = plan.tasks
    .filter((task) => task.dependsOn.length > 0)
    .map((task) => {
      const sourceTasks = task.dependsOn.map((key) => tasks.get(key)!);
      const sourceNodeIds = sourceTasks.map((sourceTask) => sourceTask.nodeId);
      return {
        from: sourceNodeIds,
        to: task.nodeId,
        edgeType: 'direct',
        beforeTransition: requirePredecessorOutputs(
          sourceTasks,
          resolveMissionOracleEvidence,
          persistMissionOracleResult,
        ),
      };
    });
  return {
    planId: plan.planId,
    missionId: plan.mission.missionId,
    actors: plan.tasks.map(({ nodeId, agentId, taskId }) => ({ nodeId, agentId, taskId })),
    graphConfig:
      agents.length === 1
        ? { type: 'standard', agents, compileOptions }
        : { type: 'multi-agent', agents, edges, compileOptions },
    validation: plan.tasks
      .filter((task) => task.validation.length > 0)
      .map((task) => ({
        taskId: task.taskId,
        nodeId: task.nodeId,
        requirements: structuredClone(task.validation),
      })),
  };
}
