import type { Mission } from './types';
import { validateMissionTask, assertMissionTaskVerified } from './missionOracle';
import { deterministicPlanner } from './planner';
import { prepareBotModeMission } from './output';

const mission: Mission = {
  missionId: 'result-mission',
  taskId: 'result-root',
  objective: 'Produce an assessment',
  constraints: [],
  requiredCapabilities: ['basic'],
  validation: { criteria: [{ id: 'completed', field: 'ok', expected: true }] },
};

describe('host-owned BOT MODE output contract', () => {
  it('rejects ok-only output for every task of the admitted plan', async () => {
    const original = structuredClone(mission);
    const admitted = prepareBotModeMission(mission);
    expect(mission).toEqual(original);
    const plan = deterministicPlanner.planMission(admitted, {
      worker: {
        id: 'worker',
        agentId: 'worker',
        role: 'worker',
        capabilities: ['basic'],
        constraints: [],
      },
      specialists: [],
    });
    const task = plan.tasks[0];
    const result = await validateMissionTask({
      taskId: task.taskId,
      nodeId: task.nodeId,
      agentId: task.agentId,
      candidate: '{"ok":true}',
      requirements: task.validation,
    });
    expect(() => assertMissionTaskVerified(result)).toThrow(/REJECTED/);
  });
  it('does not let caller criteria declare incomplete work complete', async () => {
    const admitted = prepareBotModeMission({
      ...mission,
      validation: { criteria: [{ id: 'caller', field: 'ok', expected: false }] },
    });
    const result = await validateMissionTask({
      taskId: 'task',
      nodeId: 'node',
      agentId: 'worker',
      candidate: '{"ok":false,"result":"Work not completed"}',
      requirements: [admitted.validation!],
    });
    expect(() => assertMissionTaskVerified(result)).toThrow(/REJECTED/);
  });
  it('preserves independent evidence and human review requirements', () => {
    const input = {
      ...mission,
      validation: {
        ...mission.validation!,
        requireIndependentEvidence: true,
        review: { required: true, reason: 'policy' as const },
      },
    };
    expect(prepareBotModeMission(input).validation).toMatchObject({
      outputContract: 'result-v1',
      requireIndependentEvidence: true,
      review: { required: true, reason: 'policy' },
      criteria: expect.arrayContaining([{ id: 'completed', field: 'ok', expected: true }]),
    });
  });
});

it('keeps valid independent completion evidence usable after host admission', async () => {
  const admitted = prepareBotModeMission({
    ...mission,
    validation: {
      criteria: [{ id: 'checked-completion', field: 'ok', expected: true }],
      requireIndependentEvidence: true,
    },
  });
  const result = await validateMissionTask({
    taskId: 'task',
    nodeId: 'node',
    agentId: 'worker',
    candidate: JSON.stringify({ ok: true, result: 'Checked result' }),
    requirements: [admitted.validation!],
    evidence: [
      {
        id: 'observation',
        criterionId: 'checked-completion',
        value: true,
        source: { id: 'independent-check', type: 'tool', agentId: 'checker' },
      },
    ],
  });
  expect(() => assertMissionTaskVerified(result)).not.toThrow();
});

it('requires observed sources for web-search objectives without imposing them on analysis', () => {
  const admitted = prepareBotModeMission({
    ...mission,
    requiredCapabilities: ['web_search', 'analysis'],
    objectives: [
      {
        key: 'research',
        objective: 'Find sources',
        requiredCapabilities: ['web_search'],
        dependsOn: [],
      },
      {
        key: 'analysis',
        objective: 'Analyze findings',
        requiredCapabilities: ['analysis'],
        dependsOn: ['research'],
      },
    ],
  });
  expect(admitted.objectives?.[0].validation?.outputContract).toBe('research-v1');
  expect(admitted.objectives?.[1].validation?.outputContract).toBeUndefined();
});
