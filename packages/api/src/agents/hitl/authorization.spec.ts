import { z } from 'zod';
import { MemorySaver } from '@langchain/langgraph';
import { tool } from '@librechat/agents/langchain/tools';
import { HumanMessage } from '@librechat/agents/langchain/messages';
import { Run, Providers, FakeChatModel, executeHooks } from '@librechat/agents';
import type { PreToolUseHookInput, PreToolUseHookOutput } from '@librechat/agents';
import { registerToolApprovalHook, clearToolApprovalHooks } from './hooks';
import { createAttachedCodeEnvironmentPolicyHook } from './byom';
import { createToolExecuteHandler } from '../handlers';
import { buildHITLRunWiring } from './runtime';

afterEach(() => clearToolApprovalHooks());

test('lazy aliases keep the authorization gate active', async () => {
  registerToolApprovalHook(
    () => async () => {
      throw new Error('policy unavailable');
    },
    {
      matcher: '^legacy_counter$',
    },
  );
  const policy = { enabled: true, mode: 'bypass' as const };
  const wiring = buildHITLRunWiring(policy)!;
  const input = { hook_event_name: 'PreToolUse', toolName: 'counter' } as PreToolUseHookInput;
  expect((await executeHooks({ registry: wiring.hooks, input })).decision).toBe('allow');
  wiring.addMCPToolAliases([{ name: 'counter', aliasName: 'legacy_counter' }], policy);
  expect((await executeHooks({ registry: wiring.hooks, input })).decision).toBe('deny');
});

// Both routes consume the same host-created registry. The event route additionally
// exercises LibreChat's real execution handler; no network/provider is called.
describe.each(['direct', 'event'] as const)('host authorization: %s', (path) => {
  test.each(['allow', 'deny', 'ask', 'exception', 'timeout', 'invalid', 'updatedInput'])(
    '%s gates the native tool effect',
    async (mode) => {
      const effects: number[] = [];
      const identities: PreToolUseHookInput[] = [];
      const signals: AbortSignal[] = [];
      const counter = tool(
        async ({ amount }) => {
          effects.push(amount);
          return 'counted';
        },
        {
          name: 'counter',
          description: 'in-memory counter',
          schema: z.object({ amount: z.number() }),
        },
      );
      const factory = jest.fn(() => async (input: PreToolUseHookInput, signal: AbortSignal) => {
        signals.push(signal);
        identities.push(input);
        if (mode === 'exception') throw new Error('synthetic policy failure');
        if (mode === 'timeout') return new Promise<PreToolUseHookOutput>(() => {});
        if (mode === 'invalid') return {};
        if (mode === 'updatedInput')
          return { decision: 'allow' as const, updatedInput: { amount: 10 } };
        return { decision: mode as 'allow' | 'deny' | 'ask' };
      });
      registerToolApprovalHook(factory, { matcher: '^counter$' });
      const context = { userId: 'synthetic-user', conversationId: 'thread', tenantId: 'tenant' };
      const wiring = buildHITLRunWiring({ enabled: true, mode: 'bypass' }, context)!;
      expect(factory).toHaveBeenCalledWith(context);
      // Exercise the SDK's existing per-matcher timeout, not a host timer or race.
      wiring.hooks.getMatchers('PreToolUse')[1].timeout = 10;
      const loadTools = jest.fn(async () => ({ loadedTools: [counter] }));
      const handler = createToolExecuteHandler({ loadTools });
      const dispatch = jest.fn(handler.handle.bind(handler));
      const run = await Run.create({
        runId: 'run',
        ...wiring,
        customHandlers: { on_tool_execute: { handle: dispatch } },
        graphConfig: {
          type: 'standard',
          compileOptions: { checkpointer: new MemorySaver() },
          agents: [
            {
              agentId: 'agent',
              provider: Providers.OPENAI,
              instructions: 'Use counter once.',
              ...(path === 'direct'
                ? { graphTools: [counter] }
                : {
                    toolDefinitions: [
                      {
                        name: 'counter',
                        description: 'in-memory counter',
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
      if (!run.Graph) throw new Error('Missing native graph');
      run.Graph.overrideModel = new FakeChatModel({
        responses: ['done'],
        toolCalls: [{ id: 'call', name: 'counter', args: { amount: 100 } }],
      });
      const config = {
        version: 'v2' as const,
        configurable: {
          thread_id: 'thread',
          user_id: 'synthetic-user',
        },
        recursionLimit: 8,
      };
      await run.processStream({ messages: [new HumanMessage('Count once')] }, config);
      if (mode === 'ask') {
        expect(effects).toEqual([]);
        expect(dispatch).not.toHaveBeenCalled();
        expect(loadTools).not.toHaveBeenCalled();
        expect(run.getInterrupt()).toBeTruthy();
        await run.resume({ call: { type: 'approve' } }, config);
        expect(identities).toHaveLength(2);
        expect(identities[1]).toEqual(identities[0]);
      }
      if (mode === 'timeout') expect(signals[0].aborted).toBe(true);
      const blocked = ['deny', 'exception', 'timeout', 'invalid'].includes(mode);
      expect(effects).toEqual(blocked ? [] : [mode === 'updatedInput' ? 10 : 100]);
      expect(dispatch).toHaveBeenCalledTimes(path === 'event' && !blocked ? 1 : 0);
      expect(loadTools).toHaveBeenCalledTimes(path === 'event' && !blocked ? 1 : 0);
      expect(identities[0]).toMatchObject({
        runId: 'run',
        threadId: 'thread',
        executingAgentId: 'agent',
        toolUseId: 'call',
        stepId: expect.any(String),
        turn: expect.any(Number),
      });
      const message = run.getRunMessages()?.find((m) => m._getType() === 'tool');
      expect(message).toMatchObject({
        tool_call_id: 'call',
        status: blocked ? 'error' : 'success',
      });
    },
  );
});

test('all authorization registrations require decisions, including unfiltered hooks', async () => {
  registerToolApprovalHook(() => async () => ({}));
  const wiring = buildHITLRunWiring({ enabled: true, mode: 'bypass' })!;
  expect(wiring.hooks.getMatchers('PreToolUse').every((m) => m.authorizationDecisionRequired)).toBe(
    true,
  );
  const result = await executeHooks({
    registry: wiring.hooks,
    input: { hook_event_name: 'PreToolUse', toolName: 'counter' } as PreToolUseHookInput,
  });
  expect(result.decision).toBe('deny');
});

test('non-restrictive fixture hook cannot override static ask approval', async () => {
  registerToolApprovalHook(() => async () => ({ decision: 'allow' as const }));
  const wiring = buildHITLRunWiring({
    enabled: true,
    mode: 'bypass',
    ask: ['approval_probe_mcp_e2e-memory'],
  })!;
  const result = await executeHooks({
    registry: wiring.hooks,
    input: {
      hook_event_name: 'PreToolUse',
      toolName: 'approval_probe_mcp_e2e-memory',
    } as PreToolUseHookInput,
  });
  expect(result.decision).toBe('ask');
});

describe.each(['read_file', 'bash_tool'])('out-of-scope %s', (toolName) => {
  test.each(['allow', 'ask', 'deny'] as const)('preserves baseline %s', async (decision) => {
    const unrelated = jest.fn(async () => ({ decision: 'deny' as const }));
    registerToolApprovalHook(() => unrelated, { matcher: '^other$' });
    registerToolApprovalHook(() => createAttachedCodeEnvironmentPolicyHook(new Set(['attached'])));
    const wiring = buildHITLRunWiring({ enabled: true, [decision]: [toolName] })!;
    const result = await executeHooks({
      registry: wiring.hooks,
      input: {
        hook_event_name: 'PreToolUse',
        toolName,
        executingAgentId: 'managed',
      } as PreToolUseHookInput,
    });
    expect(result.decision).toBe(decision);
    expect(unrelated).not.toHaveBeenCalled();
  });
});
