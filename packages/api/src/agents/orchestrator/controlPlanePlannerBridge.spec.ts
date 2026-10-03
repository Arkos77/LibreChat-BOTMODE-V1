import { projectMissionPlanToControlPlane } from './controlPlanePlannerBridge';
import { deterministicPlanner } from './planner';
import type { Mission, PlannerContext } from './types';

const mission: Mission = {
  missionId: 'mission-1',
  taskId: 'task-root',
  objective: 'Launch research',
  constraints: ['bounded'],
  requiredCapabilities: ['research'],
  objectives: [
    { key: 'research', objective: 'Research market', requiredCapabilities: ['research'], dependsOn: [] },
  ],
};

const context: PlannerContext = {
  worker: {
    id: 'worker',
    agentId: 'agent-worker',
    role: 'worker',
    capabilities: ['research'],
    constraints: [],
  },
  specialists: [],
};

describe('control plane planner bridge', () => {
  it('projects an existing MissionPlan without creating another execution graph', () => {
    const plan = deterministicPlanner.planMission(mission, context);
    const result = projectMissionPlanToControlPlane({
      plan,
      projectId: 'project-1',
      ownerId: 'user-1',
    });
    expect(result.goal.goalId).toBe('mission-1');
    expect(result.project.projectId).toBe('project-1');
    expect(result.tasks.map((task) => task.taskId)).toEqual(['task-root/research']);
    expect(result.tasks[0].requiredCapabilities).toEqual(['research']);
  });

  it('preserves host-supplied budget and delegation instead of inventing authority', () => {
    const plan = deterministicPlanner.planMission(mission, context);
    const result = projectMissionPlanToControlPlane({
      plan,
      projectId: 'project-1',
      ownerId: 'user-1',
      budget: { currency: 'tokenCredits', maxAmount: 50, source: 'host' },
      delegation: { allowAgents: false, maxDepth: 0, maxChildren: 1 },
    });
    expect(result.budget).toEqual({ currency: 'tokenCredits', maxAmount: 50, source: 'host' });
    expect(result.delegation).toEqual({ allowAgents: false, maxDepth: 0, maxChildren: 1 });
  });
});
