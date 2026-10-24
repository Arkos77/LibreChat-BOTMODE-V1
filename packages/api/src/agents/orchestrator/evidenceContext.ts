import type { MissionPlan } from './types';
import { nodeIdentity } from './planner';
import { isResearchTask, researchObservationNodeId } from './research';
import type { ToolEvidenceIntentDeclaration } from './toolEvidenceIntent';

interface TaskScope {
  nodeId: string;
  taskId: string;
  producerAgentId: string;
}
interface Scope {
  traceId: string;
  taskId: string;
  producerAgentId: string;
  declarations: ToolEvidenceIntentDeclaration[];
  collectSources?: true;
}
interface Configuration {
  traceId: string;
  declarations: (TaskScope & ToolEvidenceIntentDeclaration)[];
  sourceTasks?: TaskScope[];
}

export function createMissionEvidenceContext() {
  let scopes = new Map<string, Scope>();
  return {
    configure({ traceId, declarations, sourceTasks = [] }: Configuration): void {
      if (
        typeof traceId !== 'string' ||
        !traceId.trim() ||
        !Array.isArray(declarations) ||
        !Array.isArray(sourceTasks)
      ) {
        throw new Error('Invalid mission evidence configuration');
      }
      const next = new Map<string, Scope>();
      const add = (task: TaskScope): Scope => {
        if (
          ![task?.nodeId, task?.taskId, task?.producerAgentId].every(
            (value) => typeof value === 'string' && value.trim(),
          )
        ) {
          throw new Error('Invalid mission evidence identity');
        }
        const nodeId = task.nodeId.trim(),
          taskId = task.taskId.trim(),
          producerAgentId = task.producerAgentId.trim();
        const current = next.get(nodeId) ?? {
          traceId: traceId.trim(),
          taskId,
          producerAgentId,
          declarations: [],
        };
        if (current.taskId !== taskId || current.producerAgentId !== producerAgentId) {
          throw new Error('Mission evidence identity mismatch');
        }
        next.set(nodeId, current);
        return current;
      };
      for (const declaration of declarations) {
        add(declaration).declarations.push({
          toolName: declaration.toolName,
          criterionId: declaration.criterionId,
          expectedValue: declaration.expectedValue,
        });
      }
      for (const task of sourceTasks) {
        const scope = add(task);
        scope.collectSources = true;
        const phase = add({ ...task, nodeId: researchObservationNodeId(task.nodeId) });
        phase.collectSources = true;
        phase.declarations = structuredClone(scope.declarations);
      }
      scopes = next;
    },
    resolve(nodeId?: string): Scope | undefined {
      if (typeof nodeId !== 'string' || !nodeId.trim()) return undefined;
      const scope = scopes.get(nodeId.trim());
      return scope == null ? undefined : structuredClone(scope);
    },
  };
}

/** Translate a native task identity only through the host-authorized immutable plan.
 * Unknown identities remain unknown to the existing per-agent permission map. */
export function resolveNativeMissionToolAgentId(
  plan: MissionPlan | undefined,
  executionId?: string,
): string | undefined {
  if (typeof executionId !== 'string') return undefined;
  if (plan == null) return executionId;
  const task = plan.tasks.find(
    (candidate) =>
      candidate.nodeId === executionId ||
      (plan.mission.researchExecutionVersion === 1 &&
        isResearchTask(candidate) &&
        researchObservationNodeId(candidate.nodeId) === executionId),
  );
  if (task == null) return executionId;
  if (task.nodeId !== nodeIdentity(plan.mission.missionId, task.key)) {
    throw new Error('Invalid native task identity');
  }
  return task.agentId;
}

/** Phase narrowing is checked before the native host loads executable tools.
 * Model-visible schemas alone do not constrain an event-driven tool request. */
export function assertNativeMissionPhaseTools(
  plan: MissionPlan | undefined,
  executionId: string | undefined,
  toolNames: readonly string[],
): void {
  const task = plan?.tasks.find(
    (candidate) =>
      isResearchTask(candidate) && researchObservationNodeId(candidate.nodeId) === executionId,
  );
  if (task == null) {
    if (executionId?.startsWith('p6r_')) {
      throw new Error('BOTMODE_RESEARCH_PHASE_CONTEXT_REQUIRED');
    }
    return;
  }
  if (plan?.mission.researchExecutionVersion !== 1) {
    throw new Error('BOTMODE_RESEARCH_PHASE_CONTEXT_REQUIRED');
  }
  resolveNativeMissionToolAgentId(plan, executionId);
  if (toolNames.some((name) => name !== 'web_search')) {
    throw new Error('BOTMODE_RESEARCH_TOOL_POLICY_CONFLICT');
  }
}
