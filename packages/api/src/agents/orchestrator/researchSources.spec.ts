import { z } from 'zod';
import { Run, Providers } from '@librechat/agents';
import { MemorySaver, Command } from '@langchain/langgraph';
import { AIMessageChunk, HumanMessage } from '@librechat/agents/langchain/messages';
import { DynamicStructuredTool } from '@librechat/agents/langchain/tools';
import type { MissionOracleState } from './missionOracle';
import {
  normalizeMissionOracleState,
  promoteTransientMissionOracleEvidence,
} from './missionOracle';
import { createTransientEvidenceBuffer } from './transientEvidenceBuffer';
import { researchObservationNodeId } from './research';
import { deterministicPlanner } from './planner';
import { prepareBotModeMission } from './output';
import { compileNativePlan } from './native';

type Mode = 'success' | 'write-failed' | 'missing' | 'foreign-call' | 'tool-error' | 'resume';

function fixture(mode: Mode, beforeWrite?: () => Promise<void>) {
  const plan = deterministicPlanner.planMission(
    prepareBotModeMission({
      missionId: `source-barrier-${mode}`,
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
  const saver = new MemorySaver();
  let saved: MissionOracleState = { evidence: {}, results: {} };
  let effects = 0,
    observationCalls = 0,
    resultCalls = 0,
    sourceReads = 0,
    sourceWrites = 0;
  const observed = { toolCallId: 'current-search', urls: ['https://example.invalid/report'] };
  const create = async () => {
    const buffer = createTransientEvidenceBuffer();
    let restored = normalizeMissionOracleState(saved);
    const tool = new DynamicStructuredTool({
      name: 'web_search',
      description: 'Synthetic search',
      schema: z.object({ query: z.string() }),
      func: async () => {
        effects++;
        if (mode === 'tool-error') throw new Error('controlled tool refusal');
        buffer.append({
          toolCallId: observed.toolCallId,
          toolName: 'web_search',
          producerAgentId: 'saved',
          taskId: task.taskId,
          sourceUrls: observed.urls,
        });
        return 'Synthetic source';
      },
    });
    const compiled = compileNativePlan(
      plan,
      new Map([
        [
          'saved',
          {
            agentId: 'saved',
            provider: Providers.OPENAI,
            tools: [tool],
            clientOptions: { model: 'synthetic', apiKey: 'not-a-real-key' },
          },
        ],
      ]),
      { checkpointer: saver },
      undefined,
      undefined,
      async (taskId) => {
        sourceReads++;
        expect(taskId).toBe(task.taskId);
        if (mode === 'write-failed') throw new Error('controlled persistence failure');
        if (mode === 'missing') return [];
        if (mode === 'foreign-call') return [{ ...observed, toolCallId: 'old-search' }];
        if (buffer.size > 0) {
          await beforeWrite?.();
          for (const item of buffer.snapshot()) {
            restored = promoteTransientMissionOracleEvidence(plan, restored, item);
          }
          saved = normalizeMissionOracleState(restored);
          sourceWrites++;
          buffer.clear();
        }
        return restored.sources?.[taskId] ?? [];
      },
    );
    const run = await Run.create({ runId: `source-${mode}`, graphConfig: compiled.graphConfig });
    if (!run.Graph) throw new Error('Missing native graph');
    run.Graph.overrideModel = {
      invoke: async (_messages, config) => {
        if (config?.metadata?.agentId === researchObservationNodeId(task.nodeId)) {
          observationCalls++;
          return new AIMessageChunk({
            id: `search-${observationCalls}`,
            content: '',
            tool_calls: [{ id: observed.toolCallId, name: 'web_search', args: { query: 'local' } }],
          });
        }
        resultCalls++;
        expect(saved.sources?.[task.taskId]).toEqual([observed]);
        if (mode === 'resume' && resultCalls === 1) throw new Error('controlled result failure');
        return new AIMessageChunk({
          id: `result-${resultCalls}`,
          content:
            '{"ok":true,"result":"Synthetic source https://example.invalid/report","sources":"https://example.invalid/report"}',
        });
      },
    };
    return run;
  };
  return {
    create,
    task,
    observed,
    saved: () => structuredClone(saved),
    counts: () => ({ effects, observationCalls, resultCalls, sourceReads, sourceWrites }),
  };
}

const config = {
  version: 'v2' as const,
  configurable: { thread_id: 'source-barrier-thread' },
  recursionLimit: 20,
};
const input = () => ({ messages: [new HumanMessage('Synthetic research')] });

it('saves native tool observations before invoking the result model', async () => {
  const f = fixture('success');
  const run = await f.create();
  await run.processStream(input(), config);
  expect(f.counts()).toMatchObject({ effects: 1, resultCalls: 1, sourceReads: 1, sourceWrites: 1 });
  expect(f.saved().sources?.[f.task.taskId]).toEqual([f.observed]);
});

it('keeps the result model blocked until asynchronous source persistence completes', async () => {
  let release: () => void = () => {};
  let entered: () => void = () => {};
  const pendingWrite = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writeStarted = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const f = fixture('success', async () => {
    entered();
    await pendingWrite;
  });
  const run = await f.create();
  const completion = run.processStream(input(), config).then(
    () => undefined,
    (error: Error) => error,
  );
  try {
    await writeStarted;
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(f.counts()).toMatchObject({ effects: 1, resultCalls: 0, sourceWrites: 0 });
  } finally {
    release();
  }
  expect(await completion).toBeUndefined();
  expect(f.counts()).toMatchObject({ resultCalls: 1, sourceWrites: 1 });
});

it.each(['write-failed', 'missing', 'foreign-call', 'tool-error'] as const)(
  'blocks the result model when the source barrier is %s',
  async (mode) => {
    const f = fixture(mode);
    const run = await f.create();
    await expect(run.processStream(input(), config)).rejects.toThrow();
    expect(f.counts()).toMatchObject({ effects: 1, resultCalls: 0, sourceWrites: 0 });
    expect(f.counts().sourceReads).toBe(mode === 'tool-error' ? 0 : 1);
    expect(run.getAgentOutputs()[f.task.nodeId]).toBeUndefined();
  },
);

it('restores saved sources in a new Run after result failure without repeating search', async () => {
  const f = fixture('resume');
  const first = await f.create();
  await expect(first.processStream(input(), config)).rejects.toThrow();
  expect(f.saved().sources?.[f.task.taskId]).toEqual([f.observed]);
  expect(f.counts()).toMatchObject({
    effects: 1,
    observationCalls: 1,
    resultCalls: 1,
    sourceWrites: 1,
  });
  const restored = await f.create();
  await restored.processStream(new Command({}), config);
  expect(f.counts()).toMatchObject({
    effects: 1,
    observationCalls: 1,
    resultCalls: 2,
    sourceWrites: 1,
  });
  expect(restored.getAgentOutputs()[f.task.nodeId].content).toContain('Synthetic source');
}, 20000);
