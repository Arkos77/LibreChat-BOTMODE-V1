import { AIMessage } from '@librechat/agents/langchain/messages';
import type { MissionPlan } from './types';
import { assertDistinctMissionTaskResults, assertTerminalMissionTasksVerified } from './missionOracle';

const plan: MissionPlan = {
  planId: 'plan-lineage',
  planVersion: 1,
  mission: {
    missionId: 'mission-lineage',
    taskId: 'root',
    objective: 'Verify independently produced specialist results',
    requiredCapabilities: ['basic'],
    constraints: [],
  },
  strategy: 'SEQUENTIAL',
  tasks: [
    {
      key: 'research',
      taskId: 'task-research',
      parentTaskId: 'root',
      nodeId: 'node-research',
      agentId: 'research-agent',
      objective: 'Research',
      requiredCapabilities: ['web_search'],
      constraints: [],
      dependsOn: [],
      canRunInParallel: false,
      validation: [],
    },
    {
      key: 'analysis',
      taskId: 'task-analysis',
      parentTaskId: 'root',
      nodeId: 'node-analysis',
      agentId: 'analysis-agent',
      objective: 'Analyze findings',
      requiredCapabilities: ['analysis'],
      constraints: [],
      dependsOn: ['research'],
      canRunInParallel: false,
      validation: [],
    },
  ],
  specialists: [],
  reasons: [],
};

const report = 'Evidence gathered from a completed research step, with confirmed sources. '.repeat(9);
const message = (result: string, sources?: string) =>
  new AIMessage(JSON.stringify({ result, ...(sources != null && { sources }) }));

describe('mission downstream result originality gate', () => {
  it('blocks the observed failure: analysis copies research even with different source fields', async () => {
    const outputs = {
      'node-research': message(report, 'https://example.org/source'),
      'node-analysis': message(report),
    };
    expect(() => assertDistinctMissionTaskResults(plan, outputs)).toThrow(
      'BOTMODE_DUPLICATE_TASK_OUTPUT',
    );
    const persist = jest.fn();
    await expect(assertTerminalMissionTasksVerified(plan, outputs, undefined, persist)).rejects.toThrow(
      'BOTMODE_DUPLICATE_TASK_OUTPUT',
    );
    expect(persist).not.toHaveBeenCalled();
  });

  it('allows a genuinely new analysis grounded in the same evidence', () => {
    expect(() =>
      assertDistinctMissionTaskResults(plan, {
        'node-research': message(report, 'https://example.org/source'),
        'node-analysis': message(
          'Analysis: the evidence implies operational risks, a likely scenario and uncertainty. '.repeat(5),
        ),
      }),
    ).not.toThrow();
  });

  it('does not reject short routine acknowledgements or unavailable prior outputs', () => {
    expect(() =>
      assertDistinctMissionTaskResults(plan, {
        'node-research': message('OK'),
        'node-analysis': message('OK'),
      }),
    ).not.toThrow();
    expect(() =>
      assertDistinctMissionTaskResults(plan, { 'node-research': message(report) }),
    ).not.toThrow();
  });
});
