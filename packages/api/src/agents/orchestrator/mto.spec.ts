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

  it('excludes activity data including reasoning and raw output from MTO payloads', () => {
    const activity = {
      runId: 'root-run',
      parentRunId: 'parent-run',
      subagentRunId: 'child-run',
      parentToolCallId: 'call-1',
      subagentType: 'researcher',
      subagentKind: 'agent',
      subagentAgentId: 'agent-child',
      depth: 1,
      ancestry: [],
      phase: 'reasoning',
      label: 'thinking',
      data: {
        reasoning: 'private chain content',
        output: 'raw tool or model content',
      },
      timestamp: '2026-09-26T00:00:00.000Z',
    } as unknown as SubagentUpdateEvent;

    const result = fromSubagentActivity(activity, {
      traceId: 'trace-redaction',
      traceEventId: 'evt-redaction',
    });

    expect(result.payload).toEqual({
      phase: 'reasoning',
      subagentType: 'researcher',
      subagentKind: 'agent',
      depth: 1,
      label: 'thinking',
    });
    const serialized = JSON.stringify(result.payload);
    expect(serialized).not.toContain('private chain content');
    expect(serialized).not.toContain('raw tool or model content');
    expect(result.payload).not.toHaveProperty('data');
  });

  it('excludes raw Oracle candidate, criteria, and evidence values from MTO payloads', () => {
    const oracleEvent = {
      phase: 'VERIFIED',
      verdict: {
        status: 'VERIFIED',
        input: {
          taskId: 'task-sensitive',
          runId: 'run-sensitive',
          agentId: 'producer-sensitive',
          candidate: '{"secret":"candidate-value"}',
          criteria: [{ id: 'criterion-1', field: 'secret', expected: 'candidate-value' }],
          evidence: [
            {
              id: 'evidence-1',
              criterionId: 'criterion-1',
              value: 'sensitive-evidence-value',
              source: { id: 'tool-1', type: 'tool' },
            },
          ],
        },
        reasons: [
          { code: 'CRITERION_MET', criterionId: 'criterion-1', evidenceIds: ['evidence-1'] },
        ],
        checks: [
          {
            criterionId: 'criterion-1',
            expected: 'candidate-value',
            actual: 'candidate-value',
            passed: true,
          },
        ],
        contradictions: [],
        uncertainty: [],
        validator: { id: 'oracle-safe', type: 'deterministic' },
        timestamp: '2026-09-26T00:00:00.000Z',
      },
      decision: 'ACCEPT',
    } as OracleEvent;

    const result = fromOracleEvent(oracleEvent, {
      traceId: 'trace-oracle-redaction',
      traceEventId: 'evt-oracle-redaction',
    });

    expect(result.payload).toEqual({
      phase: 'VERIFIED',
      decision: 'ACCEPT',
      validator: { id: 'oracle-safe', type: 'deterministic' },
      reasonCodes: ['CRITERION_MET'],
      uncertainty: [],
      checkCount: 1,
      contradictionCount: 0,
      evidenceCount: 1,
    });
    const serialized = JSON.stringify(result.payload);
    expect(serialized).not.toContain('candidate-value');
    expect(serialized).not.toContain('sensitive-evidence-value');
    expect(serialized).not.toContain('evidence-1');
    expect(serialized).not.toContain('criterion-1');
  });
});
