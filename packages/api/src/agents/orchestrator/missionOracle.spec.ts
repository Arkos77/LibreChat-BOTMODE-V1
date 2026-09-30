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

describe('normalizeMissionOracleState', () => {
  it('returns a detached clone for valid durable state', () => {
    const state = {
      evidence: {
        'task-a': [
          {
            id: 'evidence-1',
            criterionId: 'criterion-a',
            value: true,
            source: { id: 'tool-1', type: 'tool' as const, agentId: 'agent-a' },
            confidence: 0.9,
          },
        ],
      },
      results: {},
    };

    const normalized = missionOracle.normalizeMissionOracleState(state);
    expect(normalized).toEqual(state);
    expect(normalized).not.toBe(state);
    expect(normalized.evidence['task-a']).not.toBe(state.evidence['task-a']);
  });

  it.each([
    null,
    [],
    { evidence: [], results: {} },
    { evidence: {}, results: [] },
    { evidence: { 'task-a': [{}] }, results: {} },
    { evidence: {}, results: { 'task-a': { taskId: '', nodeId: 'node-a', verdicts: [] } } },
  ])('fails closed for malformed durable state: %p', (state) => {
    expect(() => missionOracle.normalizeMissionOracleState(state)).toThrow(
      /Mission Oracle durable state/,
    );
  });
});

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
