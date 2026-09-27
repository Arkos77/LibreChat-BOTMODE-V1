const { observeSubagentToolCompletion } = require('./subagentToolObservation');

describe('native child tool completion MTO observation', () => {
  it('emits bounded native identity when trace is available', () => {
    const sink = jest.fn();
    observeSubagentToolCompletion(
      {
        traceId: 'trace-1',
        taskId: 'task-1',
        toolCallId: 'call-1',
        toolName: 'verify',
        executingAgentId: 'agent-1',
        userId: 'private-user',
        conversationId: 'private-conversation',
        output: 'private-output',
        criterionId: 'target',
        value: true,
      },
      sink,
    );
    expect(sink).toHaveBeenCalledTimes(1);
    const event = sink.mock.calls[0][0];
    expect(event).toMatchObject({
      type: 'OBSERVED',
      source: 'subagent-tool-completion',
      identity: {
        traceId: 'trace-1',
        traceEventId: 'tool:call-1',
        taskId: 'task-1',
        agentId: 'agent-1',
      },
      payload: { toolCallId: 'call-1', toolName: 'verify' },
    });
    expect(JSON.stringify(event)).not.toMatch(/private|criterionId|value/);
  });

  it('omits observations without a trace and contains sink failure', () => {
    const sink = jest.fn(() => {
      throw new Error('sink failed');
    });
    expect(
      observeSubagentToolCompletion(
        { taskId: 'task-1', toolCallId: 'call-1', toolName: 'verify' },
        sink,
      ),
    ).toBeNull();
    expect(sink).not.toHaveBeenCalled();
    expect(() =>
      observeSubagentToolCompletion(
        { traceId: 'trace-1', taskId: 'task-1', toolCallId: 'call-1', toolName: 'verify' },
        sink,
      ),
    ).not.toThrow();
  });
});
