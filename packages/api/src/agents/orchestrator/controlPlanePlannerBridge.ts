import type { MissionPlan } from './types';
import {
  createControlPlaneProjection,
  type BudgetEnvelope,
  type ControlPlaneProjection,
} from './controlPlane';

export function projectMissionPlanToControlPlane({
  plan,
  projectId,
  ownerId,
  budget,
  delegation,
}: {
  plan: MissionPlan;
  projectId: string;
  ownerId: string;
  budget?: BudgetEnvelope;
  delegation?: ControlPlaneProjection['delegation'];
}): ControlPlaneProjection {
  const tasks = plan.tasks.map((task) => ({
    taskId: task.taskId,
    projectId,
    objective: task.objective,
    parentTaskId: task.parentTaskId,
    dependsOn: task.dependsOn.map(
      (dependency) => plan.mission.taskId + '/' + encodeURIComponent(dependency),
    ),
    requiredCapabilities: [...task.requiredCapabilities],
  }));

  return createControlPlaneProjection({
    goal: {
      goalId: plan.mission.missionId,
      objective: plan.mission.objective,
      constraints: [...plan.mission.constraints],
      successCriteria:
        plan.mission.validation?.criteria.map((criterion) => criterion.id) ?? [],
    },
    project: {
      projectId,
      goalId: plan.mission.missionId,
      ownerId,
    },
    tasks,
    delegation:
      delegation ?? {
        allowAgents: plan.specialists.length > 0,
        maxDepth: plan.specialists.length > 0 ? 1 : 0,
        maxChildren: plan.tasks.length,
        allowedAgentIds: plan.specialists.map((specialist) => specialist.agentId),
      },
    ...(budget ? { budget } : {}),
  });
}
