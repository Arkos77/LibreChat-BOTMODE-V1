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

describe('Mission Oracle result replay semantics', () => {
  it('considers verdicts equivalent when only their timestamps differ', () => {
    const base = {
      taskId: 'task-1',
      nodeId: 'node-1',
      verdicts: [
        {
          status: 'VERIFIED' as const,
          input: {
            taskId: 'task-1',
            agentId: 'agent-1',
            criteria: [],
            evidence: [],
          },
          reasons: [],
          checks: [],
          contradictions: [],
          uncertainty: [],
          validator: { id: 'librechat:oracle:deterministic:v1', type: 'deterministic' as const },
          timestamp: '2026-09-30T10:00:00.000Z',
        },
      ],
    };
    const replay = structuredClone(base);
    replay.verdicts[0].timestamp = '2026-09-30T10:00:01.000Z';

    expect(missionOracle.areMissionOracleResultsEquivalent(base, replay)).toBe(true);
  });

  it('detects a real verdict change despite a new timestamp', () => {
    const left = {
      taskId: 'task-1',
      nodeId: 'node-1',
      verdicts: [
        {
          status: 'VERIFIED' as const,
          input: { taskId: 'task-1', agentId: 'agent-1', criteria: [], evidence: [] },
          reasons: [],
          checks: [],
          contradictions: [],
          uncertainty: [],
          validator: { id: 'librechat:oracle:deterministic:v1', type: 'deterministic' as const },
          timestamp: '2026-09-30T10:00:00.000Z',
        },
      ],
    };
    const right = structuredClone(left);
    right.verdicts[0].status = 'REJECTED';
    right.verdicts[0].timestamp = '2026-09-30T10:00:01.000Z';
    expect(missionOracle.areMissionOracleResultsEquivalent(left, right)).toBe(false);
  });
});

describe('promoteTransientMissionOracleEvidence', () => {
  const promotionHelper = () =>
    (
      missionOracle as typeof missionOracle & {
        promoteTransientMissionOracleEvidence?: (
          plan: MissionPlan,
          state: missionOracle.MissionOracleState | undefined,
          observation: {
            source: 'native_tool_end';
            toolCallId: string;
            toolName: string;
            producerAgentId: string;
            toolAgentId?: string;
            taskId?: string;
            runId?: string;
            criterionId?: string;
            value?: string | number | boolean | null;
          },
        ) => missionOracle.MissionOracleState;
      }
    ).promoteTransientMissionOracleEvidence;

  it('promotes only an explicit exact-task criterion observation and preserves null', () => {
    const helper = promotionHelper();
    expect(helper).toEqual(expect.any(Function));

    const state = helper?.(terminalPlan(), undefined, {
      source: 'native_tool_end',
      toolCallId: 'tool-1',
      toolName: 'verify_terminal',
      producerAgentId: 'worker',
      toolAgentId: 'checker',
      taskId: 'task-terminal',
      runId: 'run-1',
      criterionId: 'ok',
      value: null,
    });

    expect(state).toEqual({
      evidence: {
        'task-terminal': [
          {
            id: 'tool-1',
            criterionId: 'ok',
            value: null,
            source: { id: 'tool-1', type: 'tool', agentId: 'checker' },
          },
        ],
      },
      results: {},
    });
  });

  it('is idempotent for the same exact observation replay', () => {
    const helper = promotionHelper();
    expect(helper).toEqual(expect.any(Function));
    const observation = {
      source: 'native_tool_end' as const,
      toolCallId: 'tool-1',
      toolName: 'verify_terminal',
      producerAgentId: 'worker',
      taskId: 'task-terminal',
      criterionId: 'ok',
      value: true,
    };
    const once = helper?.(terminalPlan(), undefined, observation);
    const twice = helper?.(terminalPlan(), once, observation);
    expect(twice?.evidence['task-terminal']).toHaveLength(1);
  });

  it('fails closed for unknown tasks, undeclared criteria, missing values, or conflicting replays', () => {
    const helper = promotionHelper();
    expect(helper).toEqual(expect.any(Function));
    const plan = terminalPlan();

    expect(() =>
      helper?.(plan, undefined, {
        source: 'native_tool_end',
        toolCallId: 'tool-unknown-task',
        toolName: 'verify_terminal',
        producerAgentId: 'worker',
        taskId: 'task-missing',
        criterionId: 'ok',
        value: true,
      }),
    ).toThrow();

    expect(() =>
      helper?.(plan, undefined, {
        source: 'native_tool_end',
        toolCallId: 'tool-unknown-criterion',
        toolName: 'verify_terminal',
        producerAgentId: 'worker',
        taskId: 'task-terminal',
        criterionId: 'not-declared',
        value: true,
      }),
    ).toThrow();

    expect(() =>
      helper?.(plan, undefined, {
        source: 'native_tool_end',
        toolCallId: 'tool-missing-value',
        toolName: 'verify_terminal',
        producerAgentId: 'worker',
        taskId: 'task-terminal',
        criterionId: 'ok',
      }),
    ).toThrow();

    const first = helper?.(plan, undefined, {
      source: 'native_tool_end',
      toolCallId: 'tool-conflict',
      toolName: 'verify_terminal',
      producerAgentId: 'worker',
      taskId: 'task-terminal',
      criterionId: 'ok',
      value: true,
    });

    expect(() =>
      helper?.(plan, first, {
        source: 'native_tool_end',
        toolCallId: 'tool-conflict',
        toolName: 'verify_terminal',
        producerAgentId: 'worker',
        taskId: 'task-terminal',
        criterionId: 'ok',
        value: false,
      }),
    ).toThrow();
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

  it('uses exact durable task evidence when validating a terminal task', async () => {
    const plan = terminalPlan();
    plan.tasks[0].validation[0].requireIndependentEvidence = true;

    await expect(
      missionOracle.assertTerminalMissionTasksVerified(
        plan,
        {
          'node-terminal': new AIMessage('{"ok":true}'),
        },
        {
          evidence: {
            'task-terminal': [
              {
                id: 'tool-independent',
                criterionId: 'ok',
                value: true,
                source: { id: 'tool-independent', type: 'tool', agentId: 'checker' },
              },
            ],
          },
          results: {},
        },
      ),
    ).resolves.toBeUndefined();
  });

  it('persists the exact terminal Oracle result before accepting verification', async () => {
    const persistMissionOracleResult = jest.fn(async () => {});
    const helper = missionOracle.assertTerminalMissionTasksVerified as unknown as (
      plan: MissionPlan,
      outputs: Record<string, AIMessage>,
      state?: missionOracle.MissionOracleState,
      persistMissionOracleResult?: (result: missionOracle.MissionOracleTaskResult) => Promise<void>,
    ) => Promise<void>;

    await expect(
      helper(
        terminalPlan(),
        { 'node-terminal': new AIMessage('{"ok":true}') },
        undefined,
        persistMissionOracleResult,
      ),
    ).resolves.toBeUndefined();

    expect(persistMissionOracleResult).toHaveBeenCalledTimes(1);
    expect(persistMissionOracleResult).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-terminal',
        nodeId: 'node-terminal',
        verdicts: [expect.objectContaining({ status: 'VERIFIED' })],
      }),
    );
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
