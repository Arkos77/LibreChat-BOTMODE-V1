import { AIMessage } from '@librechat/agents/langchain/messages';
import type { MissionPlan } from './types';
import * as missionOracle from './missionOracle';

const terminalPlan = (candidateExpected = true): MissionPlan =>
  ({
    planId: 'plan-terminal-oracle',
    planVersion: 1,
    mission: {
      missionId: 'mission-terminal-oracle',
      taskId: 'root',
      objective: 'Validate terminal output',
      requiredCapabilities: ['basic'],
      constraints: [],
    },
    strategy: 'DIRECT',
    tasks: [
      {
        key: 'terminal',
        objective: 'Produce terminal output',
        requiredCapabilities: ['basic'],
        dependsOn: [],
        taskId: 'task-terminal',
        parentTaskId: 'root',
        nodeId: 'node-terminal',
        agentId: 'worker',
        constraints: [],
        validation: [
          {
            criteria: [{ id: 'ok', field: 'ok', expected: candidateExpected }],
          },
        ],
        canRunInParallel: false,
      },
    ],
  }) as MissionPlan;

describe('terminal mission Oracle', () => {
  it('blocks a validated terminal task whose exact output is rejected', async () => {
    const helper = (
      missionOracle as typeof missionOracle & {
        assertTerminalMissionTasksVerified?: (
          plan: MissionPlan,
          outputs: Record<string, AIMessage>,
        ) => Promise<void>;
      }
    ).assertTerminalMissionTasksVerified;

    expect(helper).toEqual(expect.any(Function));
    await expect(
      helper?.(terminalPlan(), {
        'node-terminal': new AIMessage('{"ok":false}'),
      }),
    ).rejects.toThrow('REJECTED');
  });

  it('fails closed when a validated terminal task has no exact output', async () => {
    await expect(
      missionOracle.assertTerminalMissionTasksVerified(terminalPlan(), {}),
    ).rejects.toThrow('missing exact task output: node-terminal');
  });

  it('fails closed when independent evidence is required but unavailable', async () => {
    const plan = terminalPlan();
    plan.tasks[0].validation[0].requireIndependentEvidence = true;
    await expect(
      missionOracle.assertTerminalMissionTasksVerified(plan, {
        'node-terminal': new AIMessage('{"ok":true}'),
      }),
    ).rejects.toThrow('UNKNOWN');
  });

  it('skips non-terminal tasks because their outputs are gated at transitions', async () => {
    const plan = terminalPlan();
    plan.tasks.push({
      key: 'after',
      objective: 'Consume terminal',
      requiredCapabilities: ['basic'],
      dependsOn: ['terminal'],
      taskId: 'task-after',
      parentTaskId: 'root',
      nodeId: 'node-after',
      agentId: 'worker',
      constraints: [],
      validation: [],
      canRunInParallel: false,
    });

    await expect(
      missionOracle.assertTerminalMissionTasksVerified(plan, {}),
    ).resolves.toBeUndefined();
  });

  it('allows a terminal task without validation rules', async () => {
    const plan = terminalPlan();
    plan.tasks[0].validation = [];
    await expect(
      missionOracle.assertTerminalMissionTasksVerified(plan, {}),
    ).resolves.toBeUndefined();
  });
});
