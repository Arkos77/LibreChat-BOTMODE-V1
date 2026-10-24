const { createToolEndCallback } = require('./callbacks');

it('persists sources captured by the real event tool callback before the research result model', async () => {
  const { Run, Providers } = require('@librechat/agents');
  const { AIMessageChunk, HumanMessage } = require('@librechat/agents/langchain/messages');
  const { DynamicStructuredTool } = require('@librechat/agents/langchain/tools');
  const { z } = require('zod');
  const {
    compileNativePlan,
    deterministicPlanner,
    prepareBotModeMission,
    createMissionEvidenceContext,
    createTransientEvidenceBuffer,
    promoteTransientMissionOracleEvidence,
    normalizeMissionOracleState,
    researchObservationNodeId,
    createToolExecuteHandler,
  } = require('@librechat/api');
  const plan = deterministicPlanner.planMission(
    prepareBotModeMission({
      missionId: 'host-source-barrier',
      taskId: 'root',
      objective: 'Research',
      requiredCapabilities: ['web_search'],
      constraints: [],
    }),
    {
      worker: {
        id: 'worker',
        agentId: 'saved',
        role: 'worker',
        capabilities: ['web_search'],
        constraints: [],
      },
      specialists: [],
    },
  );
  const task = plan.tasks[0];
  const buffer = createTransientEvidenceBuffer();
  const context = createMissionEvidenceContext();
  context.configure({
    traceId: 'host-trace',
    declarations: [],
    sourceTasks: [{ nodeId: task.nodeId, taskId: task.taskId, producerAgentId: task.agentId }],
  });
  const callback = createToolEndCallback({
    req: { user: { id: 'host-user' }, config: {} },
    res: { headersSent: false },
    artifactPromises: [],
    streamId: null,
    transientEvidenceBuffer: buffer,
    missionEvidenceContext: context,
  });
  let saved = { evidence: {}, results: {} };
  let effects = 0,
    results = 0;
  const tool = new DynamicStructuredTool({
    name: 'web_search',
    description: 'Synthetic search',
    schema: z.object({ query: z.string() }),
    responseFormat: 'content_and_artifact',
    func: async () => {
      effects++;
      return [
        'Synthetic result',
        { web_search: { organic: [{ link: 'https://example.invalid/report' }] } },
      ];
    },
  });
  const handler = createToolExecuteHandler({
    loadTools: async (names, agentId) => {
      expect(names).toEqual(['web_search']);
      expect(agentId).toBe(researchObservationNodeId(task.nodeId));
      return { loadedTools: [tool] };
    },
    toolEndCallback: callback,
  });
  const compiled = compileNativePlan(
    plan,
    new Map([
      [
        'saved',
        {
          agentId: 'saved',
          provider: Providers.OPENAI,
          toolDefinitions: [{ name: 'web_search' }],
          clientOptions: { model: 'synthetic', apiKey: 'not-a-real-key' },
        },
      ],
    ]),
    undefined,
    undefined,
    undefined,
    async (taskId) => {
      for (const observation of buffer.snapshot()) {
        saved = normalizeMissionOracleState(
          promoteTransientMissionOracleEvidence(plan, saved, observation),
        );
      }
      buffer.clear();
      return saved.sources?.[taskId] ?? [];
    },
  );
  const run = await Run.create({
    runId: 'host-source-barrier',
    graphConfig: compiled.graphConfig,
    customHandlers: { on_tool_execute: handler },
  });
  run.Graph.overrideModel = {
    invoke: async (_messages, config) => {
      if (config?.metadata?.agentId === researchObservationNodeId(task.nodeId)) {
        return new AIMessageChunk({
          id: 'host-observation',
          content: '',
          tool_calls: [{ id: 'host-search', name: 'web_search', args: { query: 'local' } }],
        });
      }
      results++;
      expect(saved.sources?.[task.taskId]).toEqual([
        { toolCallId: 'host-search', urls: ['https://example.invalid/report'] },
      ]);
      return new AIMessageChunk({ id: 'host-result', content: '{"ok":true,"result":"synthetic"}' });
    },
  };
  await run.processStream({ messages: [new HumanMessage('Research')] }, { version: 'v2' });
  expect(effects).toBe(1);
  expect(results).toBe(1);
  expect(buffer.size).toBe(0);
});

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
  it('captures a native observation-phase source under the canonical task identity', async () => {
    const {
      createMissionEvidenceContext,
      createTransientEvidenceBuffer,
      deterministicPlanner,
      prepareBotModeMission,
      compileNativePlan,
    } = require('@librechat/api');
    const plan = deterministicPlanner.planMission(
      prepareBotModeMission({
        missionId: 'source-phase',
        taskId: 'source-root',
        objective: 'Research',
        constraints: [],
        requiredCapabilities: ['web_search'],
      }),
      {
        worker: {
          id: 'worker',
          agentId: 'saved-source-agent',
          role: 'worker',
          capabilities: ['web_search'],
          constraints: [],
        },
        specialists: [],
      },
    );
    const task = plan.tasks[0];
    const native = compileNativePlan(
      plan,
      new Map([
        [
          'saved-source-agent',
          {
            agentId: 'saved-source-agent',
            provider: 'openai',
            toolDefinitions: [{ name: 'web_search' }],
          },
        ],
      ]),
    );
    const phase = native.actors.find((actor) => actor.nodeId !== task.nodeId);
    expect(phase).toBeDefined();
    const context = createMissionEvidenceContext();
    context.configure({
      traceId: 'phase-trace',
      declarations: [],
      sourceTasks: [{ nodeId: task.nodeId, taskId: task.taskId, producerAgentId: task.agentId }],
    });
    const buffer = createTransientEvidenceBuffer();
    const callback = createToolEndCallback({
      req: { user: { id: 'user' }, config: {} },
      res: { headersSent: false },
      artifactPromises: [],
      transientEvidenceBuffer: buffer,
      missionEvidenceContext: context,
    });
    await callback(
      {
        output: {
          name: 'web_search',
          status: 'success',
          tool_call_id: 'phase-call',
          artifact: {
            web_search: { references: [{ type: 'link', link: 'https://example.org/phase' }] },
          },
        },
      },
      { agentId: phase.nodeId },
    );
    expect(buffer.snapshot()).toEqual([
      expect.objectContaining({
        taskId: task.taskId,
        producerAgentId: task.agentId,
        toolCallId: 'phase-call',
        sourceUrls: ['https://example.org/phase'],
      }),
    ]);
  });
  it.each([{ executingAgentId: 'research-node' }, { agentId: 'research-node' }])(
    'records native search sources with SDK identity %j',
    async (admittedMetadata) => {
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
      await callback(data, { agentId: 'other-node', executingAgentId: 'research-node' });
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
      await callback(data, admittedMetadata);
      expect(buffer.snapshot()[0]).toMatchObject({
        taskId: 'research-task',
        sourceUrls: ['https://example.org/report'],
      });
    },
  );
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
