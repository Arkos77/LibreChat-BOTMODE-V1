import { z } from 'zod';
import { MemorySaver } from '@langchain/langgraph';
import { tool } from '@librechat/agents/langchain/tools';
import { Run, ToolNode, Providers, FakeChatModel } from '@librechat/agents';
import { AIMessage, HumanMessage } from '@librechat/agents/langchain/messages';
import type { PreToolUseHookOutput, ToolExecuteBatchRequest } from '@librechat/agents';
import { createToolExecuteHandler } from '../handlers';
import { buildHITLRunWiring } from './runtime';

describe.each(['direct', 'event'] as const)('native effect boundary: %s', (path) => {
  test.each([
    'allow',
    'deny',
    'ask',
    'exception',
    'invalid',
    'timeout',
    'updated',
    'legacy',
    'approved-ask',
    'revoked-after-ask',
    ...(path === 'event' ? ['missing-context'] : []),
  ])('%s uses the durable phase at the final invocation', async (mode) => {
    const effects: number[] = [];
    let reads = 0;
    let asks = 0;
    let revoked = false;
    const interactive = ['approved-ask', 'revoked-after-ask'].includes(mode);
    let contextRemoved = false;
    const counter = tool(
      async ({ amount }) => {
        effects.push(amount);
        return 'counted';
      },
      { name: 'counter', description: 'memory only', schema: z.object({ amount: z.number() }) },
    );
    const wiring = buildHITLRunWiring({ enabled: true, mode: 'bypass' })!;
    if (interactive)
      wiring.hooks.register('PreToolUse', {
        authorizationDecisionRequired: true,
        once: true,
        hooks: [
          async () => {
            asks++;
            return { decision: 'ask' };
          },
        ],
      });
    if (mode !== 'legacy')
      wiring.hooks.register('PreToolUse', {
        authorizationDecisionRequired: true,
        revalidateBeforeEffect: true,
        timeout: 10,
        hooks: [
          async (input) => {
            reads++;
            expect(input.toolUseId).toBe('call');
            expect(input.runId).toBe('run');
            expect(input.threadId).toBe('thread');
            expect(input.executingAgentId).toBe('actor');
            if (revoked) return { decision: 'deny' };
            if (reads === 1) return { decision: 'allow' };
            if (mode === 'exception') throw new Error('synthetic effect authority failure');
            if (mode === 'invalid') return {};
            if (mode === 'timeout') return new Promise<PreToolUseHookOutput>(() => {});
            if (mode === 'deny' || mode === 'ask') return { decision: mode };
            return {
              decision: 'allow',
              ...(mode === 'updated' ? { updatedInput: { amount: 10 } } : {}),
            };
          },
        ],
      });
    const handler = createToolExecuteHandler({
      loadTools: async () => ({ loadedTools: [counter] }),
    });
    if (mode === 'missing-context') {
      const handle = handler.handle.bind(handler);
      jest.spyOn(handler, 'handle').mockImplementation(async (event, data) => {
        const request = data as ToolExecuteBatchRequest;
        expect(event).toBe('on_tool_execute');
        expect(request.effectAuthorityRequired).toBe(true);
        Reflect.deleteProperty(request, 'hookContext');
        contextRemoved = true;
        return handle(event, data);
      });
    }
    const run = await Run.create({
      runId: 'run',
      ...wiring,
      customHandlers: { on_tool_execute: handler },
      graphConfig: {
        type: 'standard',
        compileOptions: { checkpointer: new MemorySaver() },
        agents: [
          {
            agentId: 'actor',
            provider: Providers.OPENAI,
            ...(path === 'direct'
              ? { graphTools: [counter] }
              : {
                  toolDefinitions: [
                    {
                      name: 'counter',
                      description: 'memory only',
                      parameters: {
                        type: 'object',
                        properties: { amount: { type: 'number' } },
                        required: ['amount'],
                      },
                    },
                  ],
                }),
          },
        ],
      },
    });
    if (!run.Graph) throw new Error('Missing graph');
    run.Graph.overrideModel = new FakeChatModel({
      responses: ['done'],
      toolCalls: [{ id: 'call', name: 'counter', args: { amount: 100 } }],
    });
    const config = {
      version: 'v2' as const,
      configurable: { thread_id: 'thread' },
      recursionLimit: 8,
    };
    await run.processStream({ messages: [new HumanMessage('Count')] }, config);
    if (interactive) {
      expect(run.getInterrupt()).toBeTruthy();
      expect(effects).toEqual([]);
      expect(asks).toBe(1);
      expect(reads).toBe(1);
      revoked = mode === 'revoked-after-ask';
      await run.resume({ call: { type: 'approve' } }, config);
      expect(asks).toBe(1);
      expect(run.getInterrupt()).toBeFalsy();
    }
    if (mode === 'missing-context') expect(contextRemoved).toBe(true);
    let expectedReads = 2;
    if (mode === 'legacy') expectedReads = 0;
    if (mode === 'approved-ask') expectedReads = 3;
    if (mode === 'missing-context') expectedReads = 1;
    expect(reads).toBe(expectedReads);
    expect(effects).toEqual(
      ['allow', 'updated', 'legacy', 'approved-ask'].includes(mode)
        ? [mode === 'updated' ? 10 : 100]
        : [],
    );
  });
});

test('direct REQUIRED cannot become legacy when its registry is lost after admission', async () => {
  const wiring = buildHITLRunWiring({ enabled: true, mode: 'bypass' })!;
  const effect = jest.fn(async () => 'counted');
  const counter = tool(effect, {
    name: 'counter',
    description: 'memory only',
    schema: z.object({ amount: z.number() }),
  });
  let admission = 0;
  wiring.hooks.register('PreToolUse', {
    authorizationDecisionRequired: true,
    revalidateBeforeEffect: true,
    hooks: [
      async () => {
        admission++;
        Reflect.deleteProperty(node, 'hookRegistry');
        return { decision: 'allow' };
      },
    ],
  });
  const node = new ToolNode({ tools: [counter], hookRegistry: wiring.hooks });
  await node.invoke(
    {
      messages: [
        new AIMessage({
          content: '',
          tool_calls: [{ id: 'call', name: 'counter', args: { amount: 100 } }],
        }),
      ],
    },
    { configurable: { run_id: 'run', thread_id: 'thread' } },
  );
  expect(admission).toBe(1);
  expect(effect).not.toHaveBeenCalled();
});
