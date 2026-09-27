import { createTransientEvidenceBuffer } from './transientEvidenceBuffer';

describe('P10 transient evidence buffer', () => {
  it('preserves only explicit bounded observation fields', () => {
    const buffer = createTransientEvidenceBuffer();

    const observation = buffer.append({
      toolCallId: 'call-1',
      toolName: 'verify_skill_target',
      producerAgentId: 'producer-agent',
      toolAgentId: 'checker-agent',
      taskId: 'task-1',
      traceId: 'trace-1',
      runId: 'run-1',
      threadId: 'thread-1',
      criterionId: 'target',
      value: 'skill',
    });

    expect(observation).toEqual({
      source: 'native_tool_end',
      toolCallId: 'call-1',
      toolName: 'verify_skill_target',
      producerAgentId: 'producer-agent',
      toolAgentId: 'checker-agent',
      taskId: 'task-1',
      traceId: 'trace-1',
      runId: 'run-1',
      threadId: 'thread-1',
      criterionId: 'target',
      value: 'skill',
    });
    expect(observation).not.toHaveProperty('output');
    expect(observation).not.toHaveProperty('arguments');
    expect(observation).not.toHaveProperty('artifact');
    expect(observation).not.toHaveProperty('reasoning');
    expect(observation).not.toHaveProperty('authorized');
    expect(observation).not.toHaveProperty('publishable');
    expect(observation).not.toHaveProperty('verdict');
  });

  it('is bounded and evicts only the oldest observation', () => {
    const buffer = createTransientEvidenceBuffer(2);

    buffer.append({ toolCallId: 'call-1', toolName: 'tool-a', producerAgentId: 'agent-a' });
    buffer.append({ toolCallId: 'call-2', toolName: 'tool-b', producerAgentId: 'agent-a' });
    buffer.append({ toolCallId: 'call-3', toolName: 'tool-c', producerAgentId: 'agent-a' });

    expect(buffer.snapshot().map((item) => item.toolCallId)).toEqual(['call-2', 'call-3']);
    expect(buffer.size).toBe(2);
  });

  it('deduplicates a native tool call without mutating the first observation', () => {
    const buffer = createTransientEvidenceBuffer();

    const first = buffer.append({
      toolCallId: 'call-1',
      toolName: 'tool-a',
      producerAgentId: 'producer-a',
      criterionId: 'target',
      value: 'skill',
    });
    const replay = buffer.append({
      toolCallId: 'call-1',
      toolName: 'tool-b',
      producerAgentId: 'producer-b',
      criterionId: 'status',
      value: 'CANDIDATE',
    });

    expect(replay).toEqual(first);
    expect(buffer.snapshot()).toEqual([first]);
  });

  it('keeps identical native tool-call IDs distinct across child tasks', () => {
    const buffer = createTransientEvidenceBuffer(2);
    const first = buffer.append({
      toolCallId: 'call-shared',
      toolName: 'verify',
      producerAgentId: 'agent-a',
      taskId: 'task-a',
    });
    const second = buffer.append({
      toolCallId: 'call-shared',
      toolName: 'verify',
      producerAgentId: 'agent-b',
      taskId: 'task-b',
    });
    expect(buffer.snapshot()).toEqual([first, second]);
    expect(
      buffer.append({
        toolCallId: 'call-shared',
        toolName: 'changed',
        producerAgentId: 'agent-a',
        taskId: 'task-a',
      }),
    ).toEqual(first);
    buffer.append({
      toolCallId: 'call-new',
      toolName: 'verify',
      producerAgentId: 'agent-c',
      taskId: 'task-c',
    });
    expect(buffer.snapshot()).toEqual([second, expect.objectContaining({ taskId: 'task-c' })]);
  });

  it('returns defensive snapshots and consumes atomically', () => {
    const buffer = createTransientEvidenceBuffer();
    buffer.append({ toolCallId: 'call-1', toolName: 'tool-a', producerAgentId: 'producer-a' });

    const snapshot = buffer.snapshot();
    (snapshot[0] as { toolName: string }).toolName = 'mutated-outside';
    expect(buffer.snapshot()[0].toolName).toBe('tool-a');

    expect(buffer.consume()).toEqual([
      {
        source: 'native_tool_end',
        toolCallId: 'call-1',
        toolName: 'tool-a',
        producerAgentId: 'producer-a',
      },
    ]);
    expect(buffer.size).toBe(0);
    expect(buffer.consume()).toEqual([]);
  });

  it('clears observations without producing durable state', () => {
    const buffer = createTransientEvidenceBuffer();
    buffer.append({ toolCallId: 'call-1', toolName: 'tool-a', producerAgentId: 'producer-a' });
    buffer.clear();
    expect(buffer.size).toBe(0);
    expect(buffer.snapshot()).toEqual([]);
  });

  it('fails closed for invalid required identities and capacity', () => {
    const buffer = createTransientEvidenceBuffer();
    expect(() =>
      buffer.append({ toolCallId: ' ', toolName: 'tool-a', producerAgentId: 'producer-a' }),
    ).toThrow('toolCallId');
    expect(() =>
      buffer.append({ toolCallId: 'call-1', toolName: '', producerAgentId: 'producer-a' }),
    ).toThrow('toolName');
    expect(() =>
      buffer.append({ toolCallId: 'call-1', toolName: 'tool-a', producerAgentId: ' ' }),
    ).toThrow('producerAgentId');
    expect(() => createTransientEvidenceBuffer(0)).toThrow('capacity');
    expect(() => createTransientEvidenceBuffer(257)).toThrow('capacity');
    expect(() => createTransientEvidenceBuffer(1.5)).toThrow('capacity');
  });
});
