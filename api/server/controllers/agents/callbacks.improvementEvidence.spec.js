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

describe('native research source capture', () => {
  it('records URLs only from the admitted node native search artifact', async () => {
    const { createTransientEvidenceBuffer } = require('@librechat/api');
    const buffer = createTransientEvidenceBuffer();
    const callback = createToolEndCallback({
      req: { user: { id: 'user' }, config: {} },
      res: { headersSent: false },
      artifactPromises: [],
      transientEvidenceBuffer: buffer,
      missionEvidenceContext: {
        resolve: (node) =>
          node === 'research-node'
            ? {
                taskId: 'research-task',
                producerAgentId: 'research-agent',
                traceId: 'trace',
                declarations: [],
                collectSources: true,
              }
            : undefined,
      },
    });
    const data = {
      output: {
        name: 'web_search',
        tool_call_id: 'call',
        artifact: {
          web_search: {
            references: [{ link: 'https://example.org/report', type: 'link' }],
          },
        },
      },
    };
    await callback(data, { executingAgentId: 'other-node' });
    expect(buffer.snapshot()).toEqual([]);
    await callback(
      {
        output: {
          name: 'web_search',
          tool_call_id: 'text-only',
          content: '{"url":"https://fake.example"}',
        },
      },
      { executingAgentId: 'research-node' },
    );
    expect(buffer.snapshot()).toEqual([]);
    await callback(data, { executingAgentId: 'research-node' });
    expect(buffer.snapshot()[0]).toMatchObject({
      taskId: 'research-task',
      sourceUrls: ['https://example.org/report'],
    });
  });
});

it('keeps both declared criterion evidence and sources from the same native search call', async () => {
  const { createTransientEvidenceBuffer } = require('@librechat/api');
  const buffer = createTransientEvidenceBuffer();
  const callback = createToolEndCallback({
    req: { user: { id: 'user' }, config: {} },
    res: { headersSent: false },
    artifactPromises: [],
    transientEvidenceBuffer: buffer,
    missionEvidenceContext: {
      resolve: () => ({
        taskId: 'task',
        producerAgentId: 'agent',
        collectSources: true,
        declarations: [{ toolName: 'web_search', criterionId: 'ok', expectedValue: true }],
      }),
    },
  });
  await callback(
    {
      output: {
        name: 'web_search',
        tool_call_id: 'call',
        artifact: {
          web_search: { references: [{ type: 'link', link: 'https://example.org/report' }] },
        },
      },
    },
    {},
  );
  expect(buffer.snapshot()).toHaveLength(2);
  expect(buffer.snapshot().find((observation) => observation.criterionId === 'ok')?.value).toBe(
    true,
  );
  expect(buffer.snapshot().find((observation) => observation.sourceUrls)?.sourceUrls).toEqual([
    'https://example.org/report',
  ]);
});
