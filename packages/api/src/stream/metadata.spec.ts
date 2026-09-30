import { sanitizeJobMetadata } from './metadata';

describe('sanitizeJobMetadata', () => {
  it('preserves a host-owned MTO trace id without deriving it from run identities', () => {
    expect(sanitizeJobMetadata({ mtoTraceId: 'mto-trace-123' })).toEqual({
      mtoTraceId: 'mto-trace-123',
    });
  });

  it('preserves an exact durable orchestrator plan without sharing caller mutation', () => {
    const orchestratorPlan = {
      planId: 'mission-p6:v1',
      planVersion: 1,
      mission: {
        missionId: 'mission-p6',
        taskId: 'root',
        objective: 'Execute the approved structured mission',
        constraints: ['bounded'],
        requiredCapabilities: ['basic'],
      },
      strategy: 'DIRECT',
      tasks: [
        {
          key: 'root',
          objective: 'Execute the approved structured mission',
          requiredCapabilities: ['basic'],
          dependsOn: [],
          taskId: 'root',
          parentTaskId: 'root',
          nodeId: 'mission-p6:root',
          agentId: 'worker',
          constraints: ['bounded'],
          validation: [],
          canRunInParallel: false,
        },
      ],
      specialists: [],
      reasons: [{ code: 'WORKER_CAPABLE' }],
    };

    const sanitized = sanitizeJobMetadata({ orchestratorPlan });
    expect(sanitized.orchestratorPlan).toEqual(orchestratorPlan);
    expect(sanitized.orchestratorPlan).not.toBe(orchestratorPlan);

    orchestratorPlan.mission.objective = 'mutated after sanitize';
    expect(sanitized.orchestratorPlan?.mission.objective).toBe(
      'Execute the approved structured mission',
    );
  });
});
