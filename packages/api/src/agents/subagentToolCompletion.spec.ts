import type { SubagentUpdateEvent } from '@librechat/agents';
import { projectSubagentToolCompletion } from './subagentToolCompletion';

const base: SubagentUpdateEvent = {
  runId: 'root',
  parentRunId: 'parent',
  subagentRunId: 'child',
  subagentType: 'researcher',
  subagentKind: 'agent',
  subagentAgentId: 'producer-agent',
  phase: 'run_step_completed',
  timestamp: '2026-09-27T18:00:00.000Z',
};

describe('native child tool completion projection', () => {
  it('copies only native task, tool and executing agent identity', () => {
    const result = projectSubagentToolCompletion(' task-native ', {
      ...base,
      data: {
        result: {
          type: 'tool_call',
          tool_call: {
            id: ' call-native ',
            name: ' checker ',
            args: { secret: 'raw input' },
            output: 'raw output',
            artifact: { secret: true },
            outcome: 'success',
          },
        },
      },
    });
    expect(result).toEqual({
      taskId: 'task-native',
      toolCallId: 'call-native',
      toolName: 'checker',
      executingAgentId: 'producer-agent',
    });
    expect(JSON.stringify(result)).not.toContain('raw');
    expect(result).not.toHaveProperty('criterionId');
    expect(result).not.toHaveProperty('value');
  });

  it('does not invent a graph member or accept incomplete tool identity', () => {
    const graph = projectSubagentToolCompletion('task-graph', {
      ...base,
      subagentKind: 'graph',
      data: { result: { type: 'tool_call', tool_call: { id: 'call', name: 'checker' } } },
    });
    expect(graph).toEqual({ taskId: 'task-graph', toolCallId: 'call', toolName: 'checker' });
    expect(projectSubagentToolCompletion('task', { ...base, phase: 'run_step' })).toBeUndefined();
    expect(
      projectSubagentToolCompletion('task', {
        ...base,
        data: { result: { type: 'tool_call', tool_call: { id: 'call' } } },
      }),
    ).toBeUndefined();
  });
});
