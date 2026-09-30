const { createToolEndCallback } = require('./callbacks');

describe('P10 optional tool-end evidence callback', () => {
  function makeCallback(improvementEvidenceCallback) {
    return createToolEndCallback({
      req: { user: { id: 'user-1' }, config: {} },
      res: { headersSent: false },
      artifactPromises: [],
      streamId: null,
      improvementEvidenceCallback,
    });
  }

  it('observes a native tool end before the artifact-only path returns', async () => {
    const improvementEvidenceCallback = jest.fn().mockResolvedValue(undefined);
    const callback = makeCallback(improvementEvidenceCallback);
    const data = {
      output: {
        name: 'verify_skill_target',
        tool_call_id: 'call-p10-1',
        content: 'raw output is not interpreted here',
      },
    };
    const metadata = {
      run_id: 'run-p10-1',
      thread_id: 'thread-p10-1',
      executingAgentId: 'checker-agent',
    };

    await callback(data, metadata);

    expect(improvementEvidenceCallback).toHaveBeenCalledTimes(1);
    expect(improvementEvidenceCallback).toHaveBeenCalledWith(data, metadata);
  });

  it('resolves mission evidence scope from the executing node at tool-end time', async () => {
    const transientEvidenceBuffer = { append: jest.fn() };
    const missionEvidenceContext = {
      resolve: jest.fn().mockReturnValue({
        traceId: 'trace-p10',
        taskId: 'task-a',
        producerAgentId: 'producer-a',
        declarations: [{ toolName: 'verify_a', criterionId: 'ok', expectedValue: true }],
      }),
    };
    const callback = createToolEndCallback({
      req: { user: { id: 'user-1' }, config: {} },
      res: { headersSent: false },
      artifactPromises: [],
      streamId: null,
      transientEvidenceBuffer,
      missionEvidenceContext,
    });

    await callback(
      { output: { name: 'verify_a', tool_call_id: 'call-p10-dynamic', content: 'ignored raw' } },
      {
        executingAgentId: 'node-a',
        run_id: 'run-p10-dynamic',
        thread_id: 'thread-p10-dynamic',
      },
    );

    expect(missionEvidenceContext.resolve).toHaveBeenCalledWith('node-a');
    expect(transientEvidenceBuffer.append).toHaveBeenCalledWith({
      toolCallId: 'call-p10-dynamic',
      toolName: 'verify_a',
      producerAgentId: 'producer-a',
      taskId: 'task-a',
      traceId: 'trace-p10',
      runId: 'run-p10-dynamic',
      threadId: 'thread-p10-dynamic',
      criterionId: 'ok',
      value: true,
    });
  });

  it('does not append mission evidence when the executing node has no configured task scope', async () => {
    const transientEvidenceBuffer = { append: jest.fn() };
    const missionEvidenceContext = { resolve: jest.fn().mockReturnValue(undefined) };
    const callback = createToolEndCallback({
      req: { user: { id: 'user-1' }, config: {} },
      res: { headersSent: false },
      artifactPromises: [],
      streamId: null,
      transientEvidenceBuffer,
      missionEvidenceContext,
    });

    await callback(
      { output: { name: 'verify_a', tool_call_id: 'call-unbound', content: 'ignored raw' } },
      { executingAgentId: 'unknown-node', run_id: 'run-unbound' },
    );

    expect(missionEvidenceContext.resolve).toHaveBeenCalledWith('unknown-node');
    expect(transientEvidenceBuffer.append).not.toHaveBeenCalled();
  });

  it('preserves the existing no-artifact path when no hook is configured', async () => {
    const callback = makeCallback();
    await expect(
      callback(
        { output: { name: 'ordinary_tool', tool_call_id: 'call-p10-2', content: 'result' } },
        { run_id: 'run-p10-2' },
      ),
    ).resolves.toBeUndefined();
  });

  it('does not invoke the hook when native output is absent', async () => {
    const improvementEvidenceCallback = jest.fn();
    const callback = makeCallback(improvementEvidenceCallback);

    await callback({}, { run_id: 'run-p10-3' });

    expect(improvementEvidenceCallback).not.toHaveBeenCalled();
  });

  it('propagates hook failure instead of fabricating evidence', async () => {
    const failure = new Error('P10 evidence callback failed');
    const callback = makeCallback(jest.fn().mockRejectedValue(failure));

    await expect(
      callback(
        { output: { name: 'verify_skill_target', tool_call_id: 'call-p10-4' } },
        { run_id: 'run-p10-4' },
      ),
    ).rejects.toBe(failure);
  });
});
