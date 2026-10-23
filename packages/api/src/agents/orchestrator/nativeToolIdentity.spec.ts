import { deterministicPlanner } from './planner';

import { resolveNativeMissionToolAgentId } from './evidenceContext';

it('resolves task nodes through the authorized plan to existing tool contexts', () => {
  expect(typeof resolveNativeMissionToolAgentId).toBe('function');
  const mission = {
    missionId: 'tools',
    taskId: 'root',
    objective: 'Search',
    constraints: [],
    requiredCapabilities: ['web_search'],
  };
  const plan = deterministicPlanner.planMission(mission, {
    worker: {
      id: 'worker',
      agentId: 'worker',
      role: 'worker',
      capabilities: ['web_search'],
      constraints: [],
    },
    specialists: [],
  });
  const context = { tools: ['web_search'] };
  const contexts = new Map([['worker', context]]);
  expect(contexts.get(plan.tasks[0].nodeId)).toBeUndefined();
  expect(contexts.get(resolveNativeMissionToolAgentId(plan, plan.tasks[0].nodeId))).toBe(context);
  expect(contexts.get(resolveNativeMissionToolAgentId(plan, 'foreign-node'))).toBeUndefined();
  expect(resolveNativeMissionToolAgentId(undefined, 'worker')).toBe('worker');
  expect(resolveNativeMissionToolAgentId(plan, undefined)).toBeUndefined();
  expect(() =>
    resolveNativeMissionToolAgentId(
      { ...plan, tasks: [{ ...plan.tasks[0], nodeId: 'forged-node' }] },
      'forged-node',
    ),
  ).toThrow('Invalid native task identity');
});
