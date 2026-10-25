import type {
  AgentInputs,
  BaseGraphState,
  OpenAIClientOptions,
  MultiAgentGraphConfig,
  StandardGraphConfig,
} from '@librechat/agents';
import type { MissionOracleResultPersister, MissionOracleTaskInput } from './missionOracle';
import type { MissionPlan, OracleRequirement, PlannedTask } from './types';
import { assertMissionTaskVerified, validateMissionTask } from './missionOracle';
import { getTaskLevels, nodeIdentity } from './planner';
import { structuredTaskOptions } from './schema';
import {
  isResearchTask,
  researchObservationNodeId,
  researchPhaseBinding,
  requireResearchObservation,
} from './research';

export interface NativeMissionPlan {
  planId: string;
  missionId: string;
  graphConfig: StandardGraphConfig | MultiAgentGraphConfig;
  actors: Array<{ nodeId: string; agentId: string; taskId: string }>;
  validation: Array<{ taskId: string; nodeId: string; requirements: OracleRequirement[] }>;
}

function validatedClientOptions(binding: AgentInputs, task: PlannedTask) {
  if (
    task.validation.length === 0 ||
    !['openai', 'openrouter'].includes(binding.provider.toLowerCase())
  ) {
    return binding.clientOptions;
  }
  const options = structuredTaskOptions(
    binding.provider,
    binding.clientOptions as OpenAIClientOptions | undefined,
    task.validation,
  );
  if (options?.useResponsesApi === true) {
    return binding.clientOptions;
  }
  const format = options?.modelKwargs?.response_format;
  const hasJsonFormat = format?.type === 'json_schema' || format?.type === 'json_object';
  const hasTools = Boolean(
    binding.tools?.length ||
      binding.graphTools?.length ||
      binding.toolDefinitions?.some((tool) => tool.defer_loading !== true),
  );
  // Some OpenAI-compatible providers require tools and tool_choice together.
  // Keep explicit choices (including "none") and allow the model to finish
  // after tool results; forcing "required" on every turn would prevent that.
  const needsToolChoice = hasTools && options?.modelKwargs?.tool_choice == null;
  if (hasJsonFormat && !needsToolChoice) {
    return options;
  }
  return {
    ...options,
    modelKwargs: {
      ...options?.modelKwargs,
      ...(!hasJsonFormat && { response_format: { type: 'json_object' } }),
      ...(needsToolChoice && { tool_choice: 'auto' }),
    },
  };
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

export type MissionOracleSourcesResolver = (
  taskId: string,
) =>
  | NonNullable<MissionOracleTaskInput['observedSources']>
  | Promise<NonNullable<MissionOracleTaskInput['observedSources']>>;

function requirePredecessorOutputs(
  sourceTasks: readonly PlannedTask[],
  resolveMissionOracleEvidence?: MissionOracleEvidenceResolver,
  persistMissionOracleResult?: MissionOracleResultPersister,
  resolveMissionOracleSources?: MissionOracleSourcesResolver,
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
        observedSources:
          resolveMissionOracleSources == null ? [] : await resolveMissionOracleSources(task.taskId),
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
  resolveMissionOracleSources?: MissionOracleSourcesResolver,
): NativeMissionPlan {
  getTaskLevels(plan.tasks);
  if (plan.tasks.some(isResearchTask) && plan.mission.researchExecutionVersion !== 1) {
    throw new Error('BOTMODE_RESEARCH_PLAN_VERSION_UNSUPPORTED');
  }
  const tasks = new Map(plan.tasks.map((task) => [task.key, task]));
  const agents = plan.tasks.flatMap((task): AgentInputs[] => {
    const binding = bindings.get(task.agentId);
    if (!binding || binding.agentId !== task.agentId) {
      throw new Error(`Missing or mismatched authorized binding for ${task.agentId}`);
    }
    if (task.nodeId !== nodeIdentity(plan.mission.missionId, task.key)) {
      throw new Error('Invalid native task identity');
    }
    const result: AgentInputs = {
      ...binding,
      agentId: task.nodeId,
      ...(task.validation.length > 0 && {
        clientOptions: validatedClientOptions(binding, task),
      }),
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
          ...(task.validation.length > 0 && { validation: task.validation }),
        }),
        ...(task.validation.length === 0
          ? []
          : [
              'Required task output: return exactly one JSON object, without Markdown fences or surrounding prose. Use scalar fields only; put detailed findings and source citations in a result string.',
              'The validation criteria above are checks, not values to copy. Report completion honestly; never claim a criterion is met when the requested work or evidence is missing.',
              'For research-v1, include a sources string of newline-separated absolute HTTP(S) URLs returned by completed web_search calls. Cite these same direct URLs in result. Invented URLs and search arguments are not source observations.',
              'Respect the mission deadline and other constraints. Distinguish sourced facts from estimates and unknowns. Do not invent amounts, payment delays or citations; state when a source does not establish a claim.',
            ]),
      ]
        .filter(Boolean)
        .join('\n'),
    };
    if (!isResearchTask(task)) return [result];
    const observationId = researchObservationNodeId(task.nodeId);
    if (plan.tasks.some((other) => other.nodeId === observationId)) {
      throw new Error('Ambiguous native research phase identity');
    }
    return [
      researchPhaseBinding(
        {
          ...binding,
          agentId: observationId,
          instructions: [
            binding.instructions,
            'Internal web observation phase: call web_search for the mission below. Produce no final answer; JSON completion belongs to the following phase.',
            JSON.stringify({
              mission: plan.mission.objective,
              objective: task.objective,
              constraints: task.constraints,
            }),
          ]
            .filter(Boolean)
            .join('\n'),
        },
        'observation',
      ),
      researchPhaseBinding(result, 'result'),
    ];
  });
  const edges: MultiAgentGraphConfig['edges'] = plan.tasks
    .filter((task) => task.dependsOn.length > 0)
    .map((task) => {
      const sourceTasks = task.dependsOn.map((key) => tasks.get(key)!);
      const sourceNodeIds = sourceTasks.map((sourceTask) => sourceTask.nodeId);
      return {
        from: sourceNodeIds,
        to: isResearchTask(task) ? researchObservationNodeId(task.nodeId) : task.nodeId,
        edgeType: 'direct',
        beforeTransition: requirePredecessorOutputs(
          sourceTasks,
          resolveMissionOracleEvidence,
          persistMissionOracleResult,
          resolveMissionOracleSources,
        ),
      };
    });
  for (const task of plan.tasks.filter(isResearchTask)) {
    edges.push({
      from: researchObservationNodeId(task.nodeId),
      to: task.nodeId,
      edgeType: 'direct',
      beforeTransition: requireResearchObservation(
        task,
        resolveMissionOracleSources == null
          ? undefined
          : async (toolCallIds) => {
              const sources = await resolveMissionOracleSources(task.taskId);
              if (
                !sources.some(
                  (source) => toolCallIds.includes(source.toolCallId) && source.urls.length > 0,
                )
              ) {
                throw new Error('BOTMODE_RESEARCH_SOURCES_REQUIRED');
              }
            },
      ),
    });
  }
  return {
    planId: plan.planId,
    missionId: plan.mission.missionId,
    actors: plan.tasks.flatMap((task) => [
      ...(isResearchTask(task)
        ? [
            {
              nodeId: researchObservationNodeId(task.nodeId),
              agentId: task.agentId,
              taskId: task.taskId,
            },
          ]
        : []),
      { nodeId: task.nodeId, agentId: task.agentId, taskId: task.taskId },
    ]),
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
