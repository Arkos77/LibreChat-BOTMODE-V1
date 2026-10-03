export interface GoalDefinition {
  goalId: string;
  objective: string;
  constraints: readonly string[];
  successCriteria: readonly string[];
}

export interface ProjectContext {
  projectId: string;
  goalId: string;
  name?: string;
  ownerId: string;
}

export interface ControlTaskDefinition {
  taskId: string;
  projectId: string;
  objective: string;
  parentTaskId?: string;
  dependsOn: readonly string[];
  requiredCapabilities: readonly string[];
}

export interface DelegationPolicy {
  allowAgents: boolean;
  maxDepth: number;
  maxChildren: number;
  allowedAgentIds?: readonly string[];
}

export interface BudgetEnvelope {
  currency: string;
  maxAmount: number;
  reservedAmount?: number;
  source: 'host';
}

export interface ControlPlaneProjection {
  goal: GoalDefinition;
  project: ProjectContext;
  tasks: readonly ControlTaskDefinition[];
  delegation: DelegationPolicy;
  budget?: BudgetEnvelope;
}

const required = (name: string, value: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(name + ' is required');
  }
  return value.trim();
};

export function createControlPlaneProjection(input: ControlPlaneProjection): ControlPlaneProjection {
  required('goal.goalId', input.goal.goalId);
  required('goal.objective', input.goal.objective);
  required('project.projectId', input.project.projectId);
  required('project.goalId', input.project.goalId);
  required('project.ownerId', input.project.ownerId);

  if (input.project.goalId !== input.goal.goalId) {
    throw new Error('Project must reference the projected goal');
  }
  if (input.tasks.length === 0) {
    throw new Error('Control plane projection requires at least one task');
  }
  if (input.delegation.maxDepth < 0 || input.delegation.maxChildren < 0) {
    throw new Error('Delegation limits must be non-negative');
  }
  if (input.budget != null && (input.budget.maxAmount < 0 || (input.budget.reservedAmount ?? 0) < 0)) {
    throw new Error('Budget amounts must be non-negative');
  }

  const seen = new Set<string>();
  for (const task of input.tasks) {
    required('task.taskId', task.taskId);
    required('task.projectId', task.projectId);
    required('task.objective', task.objective);
    if (task.projectId !== input.project.projectId) {
      throw new Error('Every task must reference the projected project');
    }
    if (seen.has(task.taskId)) {
      throw new Error('Control plane task identities must be unique');
    }
    seen.add(task.taskId);
    if (task.dependsOn.includes(task.taskId)) {
      throw new Error('Task cannot depend on itself');
    }
    if (new Set(task.requiredCapabilities).size !== task.requiredCapabilities.length) {
      throw new Error('Task capabilities must be unique');
    }
  }

  return {
    goal: {
      goalId: input.goal.goalId,
      objective: input.goal.objective,
      constraints: [...input.goal.constraints],
      successCriteria: [...input.goal.successCriteria],
    },
    project: { ...input.project },
    tasks: input.tasks.map((task) => ({
      ...task,
      dependsOn: [...task.dependsOn],
      requiredCapabilities: [...task.requiredCapabilities],
    })),
    delegation: {
      ...input.delegation,
      ...(input.delegation.allowedAgentIds ? { allowedAgentIds: [...input.delegation.allowedAgentIds] } : {}),
    },
    ...(input.budget ? { budget: { ...input.budget } } : {}),
  };
}
