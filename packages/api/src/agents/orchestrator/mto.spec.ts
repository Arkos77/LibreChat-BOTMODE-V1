import type { SubagentUpdateEvent, SubagentUsageEvent } from '@librechat/agents';
import type { OracleEvent } from '../oracle';
import { createMtoEvent, fromOracleEvent, fromSubagentActivity, fromSubagentUsage } from './mto';

describe('MTO contracts', () => {
  it('requires independent trace identities and preserves native identities without conflating them', () => {
    const event = createMtoEvent(
      'STARTED',
      {
        traceId: 'trace-1',
        traceEventId: 'event-1',
        taskId: 'task-1',
        rootRunId: 'root-1',
        runId: 'run-1',
        subagentRunId: 'child-1',
      },
      'host',
    );
    expect(event.identity).toEqual({
      traceId: 'trace-1',
      traceEventId: 'event-1',
      taskId: 'task-1',
      rootRunId: 'root-1',
      runId: 'run-1',
      subagentRunId: 'child-1',
    });
  });

  it('fails closed for missing trace identities', () => {
    expect(() => createMtoEvent('OBSERVED', { traceId: '', traceEventId: 'e' }, 'host')).toThrow(
      'traceId',
    );
    expect(() => createMtoEvent('OBSERVED', { traceId: 't', traceEventId: '' }, 'host')).toThrow(
      'traceEventId',
    );
  });

  it('maps native subagent activity while keeping taskId host-owned', () => {
    const activity = {
      runId: 'root-run',
      parentRunId: 'parent-run',
      subagentRunId: 'child-run',
      parentToolCallId: 'call-1',
      subagentType: 'researcher',
      subagentKind: 'agent',
      subagentAgentId: 'agent-child',
      memberAgentId: 'member-1',
      depth: 1,
      ancestry: [],
      phase: 'run_step_closed',
      timestamp: '2026-09-26T00:00:00.000Z',
    } as SubagentUpdateEvent;
    const result = fromSubagentActivity(activity, {
      traceId: 'trace',
      traceEventId: 'evt',
      taskId: 'task',
    });
    expect(result.type).toBe('OBSERVED');
    expect(result.identity).toMatchObject({
      taskId: 'task',
      rootRunId: 'root-run',
      runId: 'root-run',
      parentRunId: 'parent-run',
      subagentRunId: 'child-run',
      agentId: 'agent-child',
      memberAgentId: 'member-1',
      parentToolCallId: 'call-1',
    });
    expect(result.timestamp).toBe(activity.timestamp);
  });

  it('maps subagent usage without inventing task identity', () => {
    const usage = {
      usage: { input_tokens: 2, output_tokens: 3 },
      subagentType: 'writer',
      subagentRunId: 'child',
      subagentAgentId: 'agent',
      parentRunId: 'parent',
      runId: 'root',
    } as unknown as SubagentUsageEvent;
    const result = fromSubagentUsage(usage, { traceId: 'trace', traceEventId: 'evt' });
    expect(result.identity.taskId).toBeUndefined();
    expect(result.identity).toMatchObject({
      rootRunId: 'root',
      runId: 'root',
      parentRunId: 'parent',
      subagentRunId: 'child',
      agentId: 'agent',
    });
  });

  it('maps Oracle phases to trace semantics without turning QA into settlement', () => {
    const input = {
      taskId: 'task-o',
      runId: 'run-o',
      agentId: 'producer',
      candidate: '{}',
      criteria: [],
      evidence: [],
    };
    const oracleEvent = {
      phase: 'VERIFIED',
      verdict: {
        status: 'VERIFIED',
        input,
        reasons: [],
        checks: [],
        contradictions: [],
        uncertainty: [],
        validator: { id: 'oracle', type: 'deterministic' },
        timestamp: '2026-09-26T00:00:00.000Z',
      },
      decision: 'ACCEPT',
    } as OracleEvent;
    const result = fromOracleEvent(oracleEvent, { traceId: 'trace', traceEventId: 'evt' });
    expect(result.type).toBe('VERIFIED');
    expect(result.identity).toMatchObject({
      taskId: 'task-o',
      runId: 'run-o',
      agentId: 'producer',
    });
    expect(result.type).not.toBe('SETTLED');
    expect(result.type).not.toBe('COMMITTED');
  });

  it('clones payloads so observation cannot mutate source state', () => {
    const payload = { nested: { value: 1 } };
    const result = createMtoEvent(
      'OBSERVED',
      { traceId: 'trace', traceEventId: 'evt' },
      'host',
      payload,
    );
    (result.payload as typeof payload).nested.value = 2;
    expect(payload.nested.value).toBe(1);
  });
});
