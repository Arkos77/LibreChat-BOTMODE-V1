import type { ControlPlaneProjection } from './controlPlane';
import { createControlPlaneProjection } from './controlPlane';

const projection = (overrides: Partial<ControlPlaneProjection> = {}): ControlPlaneProjection => ({
  goal: {
    goalId: 'goal-1',
    objective: 'Launch project',
    constraints: ['budget-bound'],
    successCriteria: ['verified'],
  },
  project: {
    projectId: 'project-1',
    goalId: 'goal-1',
    name: 'Launch',
    ownerId: 'user-1',
  },
  tasks: [
    {
      taskId: 'task-1',
      projectId: 'project-1',
      objective: 'Research',
      dependsOn: [],
      requiredCapabilities: ['research'],
    },
  ],
  delegation: {
    allowAgents: true,
    maxDepth: 2,
    maxChildren: 4,
    allowedAgentIds: ['agent-research'],
  },
  budget: {
    currency: 'tokenCredits',
    maxAmount: 100,
    reservedAmount: 20,
    source: 'host',
  },
  ...overrides,
});

describe('control plane projection', () => {
  it('creates an immutable-by-copy Goal → Project → Task projection', () => {
    const source = projection();
    const result = createControlPlaneProjection(source);
    (result.goal.constraints as string[]).push('changed');
    (result.tasks[0].dependsOn as string[]).push('changed');
    expect(source.goal.constraints).toEqual(['budget-bound']);
    expect(source.tasks[0].dependsOn).toEqual([]);
  });

  it('keeps budget descriptive and host-owned', () => {
    const result = createControlPlaneProjection(projection());
    expect(result.budget).toEqual({
      currency: 'tokenCredits',
      maxAmount: 100,
      reservedAmount: 20,
      source: 'host',
    });
  });

  it('rejects a project that references another goal', () => {
    expect(() =>
      createControlPlaneProjection(
        projection({
          project: { projectId: 'project-1', goalId: 'goal-2', ownerId: 'user-1' },
        }),
      ),
    ).toThrow('Project must reference the projected goal');
  });

  it('rejects cross-project tasks and duplicate task identities', () => {
    expect(() =>
      createControlPlaneProjection({
        ...projection(),
        tasks: [{ ...projection().tasks[0], projectId: 'project-2' }],
      }),
    ).toThrow('Every task must reference the projected project');

    expect(() =>
      createControlPlaneProjection({
        ...projection(),
        tasks: [projection().tasks[0], { ...projection().tasks[0] }],
      }),
    ).toThrow('Control plane task identities must be unique');
  });

  it('rejects invalid delegation and budget limits', () => {
    expect(() =>
      createControlPlaneProjection(
        projection({ delegation: { allowAgents: true, maxDepth: -1, maxChildren: 1 } }),
      ),
    ).toThrow('Delegation limits must be non-negative');

    expect(() =>
      createControlPlaneProjection({
        ...projection(),
        budget: { currency: 'tokenCredits', maxAmount: -1, source: 'host' },
      }),
    ).toThrow('Budget amounts must be non-negative');
  });

  it('fails closed on self-dependency and duplicate capability declarations', () => {
    expect(() =>
      createControlPlaneProjection({
        ...projection(),
        tasks: [{ ...projection().tasks[0], dependsOn: ['task-1'] }],
      }),
    ).toThrow('Task cannot depend on itself');

    expect(() =>
      createControlPlaneProjection({
        ...projection(),
        tasks: [{ ...projection().tasks[0], requiredCapabilities: ['research', 'research'] }],
      }),
    ).toThrow('Task capabilities must be unique');
  });
});
