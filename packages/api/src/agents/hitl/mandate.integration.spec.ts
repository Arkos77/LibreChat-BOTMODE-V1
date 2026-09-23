import { z } from 'zod';
import mongoose from 'mongoose';
import { MemorySaver } from '@langchain/langgraph';
import { tool } from '@librechat/agents/langchain/tools';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { HumanMessage } from '@librechat/agents/langchain/messages';
import { createAutonomyMandateMethods } from '@librechat/data-schemas';
import {
  Run,
  Providers,
  FakeChatModel,
  Constants,
  InMemorySubagentTaskStore,
} from '@librechat/agents';
import type { AutonomyMandateMethods } from '@librechat/data-schemas';
import { createToolExecuteHandler } from '../handlers';
import { buildHITLRunWiring } from './runtime';

let server: MongoMemoryServer;
let methods: AutonomyMandateMethods;
const scope = { userId: 'owner', tenantId: 'tenant' };
const binding = { actorId: 'actor', conversationId: 'thread' };
const rules = {
  allowedCapabilities: ['counter'],
  deniedCapabilities: [],
  validFrom: new Date(0),
  expiresAt: new Date('2100-01-01'),
  reason: 'synthetic mandate',
};
beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { dbName: 'p8_mandate_effect_tests' });
  methods = createAutonomyMandateMethods(mongoose);
});
afterAll(async () => {
  await mongoose.disconnect();
  await server?.stop();
});
beforeEach(async () => {
  await mongoose.models.AutonomyMandate.deleteMany({});
});

describe.each(['direct', 'event'] as const)('durable mandate on %s', (path) => {
  test.each([
    'active',
    'missing',
    'capability',
    'explicit_deny',
    'expired',
    'revoked',
    'scope',
    'lookup_error',
    'stronger_deny',
    'same_run_revoke',
    'approved_after_revoke',
    'legacy',
  ])('%s gates the native effect', async (mode) => {
    const mandate = await methods.createAutonomyMandate(scope, binding, rules);
    if (mode === 'capability')
      await methods.reviseAutonomyMandate(scope, mandate._id, 1, {
        ...rules,
        allowedCapabilities: [],
      });
    if (mode === 'explicit_deny')
      await methods.reviseAutonomyMandate(scope, mandate._id, 1, {
        ...rules,
        deniedCapabilities: ['counter'],
      });
    if (mode === 'expired')
      await methods.reviseAutonomyMandate(scope, mandate._id, 1, {
        ...rules,
        expiresAt: new Date(1),
      });
    if (mode === 'revoked') await methods.revokeAutonomyMandate(scope, mandate._id, 1, 'stop');
    const effects: number[] = [];
    const counter = tool(
      async ({ amount }) => {
        effects.push(amount);
        return 'counted';
      },
      {
        name: 'counter',
        description: 'harmless counter',
        schema: z.object({ amount: z.number() }),
      },
    );
    const wiring = buildHITLRunWiring(
      {
        enabled: true,
        mode: 'bypass',
        ...(mode === 'stronger_deny' && { deny: ['counter'] }),
        ...(mode === 'approved_after_revoke' && { ask: ['counter'] }),
      },
      {
        ...scope,
        conversationId: 'thread',
        ...(mode !== 'legacy' && {
          autonomyMandateId: mode === 'missing' ? 'missing' : mandate._id,
        }),
      },
    )!;
    const read = jest.spyOn(mongoose.models.AutonomyMandate, 'findOne');
    if (mode === 'lookup_error')
      read.mockImplementation(() => {
        throw new Error('synthetic lookup failure');
      });
    const handler = createToolExecuteHandler({
      loadTools: async () => ({ loadedTools: [counter] }),
    });
    const run = await Run.create({
      runId: 'run',
      ...wiring,
      customHandlers: { on_tool_execute: handler },
      graphConfig: {
        type: 'standard',
        compileOptions: { checkpointer: new MemorySaver() },
        agents: [
          {
            agentId: mode === 'scope' ? 'other' : 'actor',
            provider: Providers.OPENAI,
            ...(path === 'direct'
              ? { graphTools: [counter] }
              : {
                  toolDefinitions: [
                    {
                      name: 'counter',
                      description: 'counter',
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
      toolCalls: [{ id: 'call', name: 'counter', args: { amount: 1 } }],
    });
    const config = {
      version: 'v2' as const,
      configurable: { thread_id: 'thread', user_id: 'owner' },
      recursionLimit: 8,
    };
    await run.processStream({ messages: [new HumanMessage('Count')] }, config);
    if (mode === 'approved_after_revoke') {
      expect(run.getInterrupt()).toBeTruthy();
      expect(effects).toEqual([]);
      await methods.revokeAutonomyMandate(scope, mandate._id, 1, 'stop while paused');
      await run.resume({ call: { type: 'approve' } }, config);
      expect(effects).toEqual([]);
      return;
    }
    expect(run.getInterrupt()).toBeFalsy();
    expect(effects).toEqual(['active', 'same_run_revoke', 'legacy'].includes(mode) ? [1] : []);
    if (mode === 'same_run_revoke') {
      await methods.revokeAutonomyMandate(scope, mandate._id, 1, 'stop between effects');
      read.mockClear();
      run.Graph.overrideModel = new FakeChatModel({
        responses: ['done'],
        toolCalls: [{ id: 'second-call', name: 'counter', args: { amount: 2 } }],
      });
      await run.processStream({ messages: [new HumanMessage('Count again')] }, config);
      expect(read).toHaveBeenCalled();
      expect(effects).toEqual([1]);
    }
    if (mode === 'legacy') expect(read).not.toHaveBeenCalled();
  });
});

test.each([false, true])(
  'native child cannot gain authority (background=%s)',
  async (background) => {
    const mandate = await methods.createAutonomyMandate(scope, binding, {
      ...rules,
      allowedCapabilities: [Constants.SUBAGENT, 'counter'],
    });
    const observed: string[] = [];
    let effects = 0;
    const counter = tool(
      async () => {
        effects++;
        return 'counted';
      },
      { name: 'counter', description: 'counter', schema: z.object({}) },
    );
    const wiring = buildHITLRunWiring(
      { enabled: true, mode: 'bypass' },
      { ...scope, conversationId: 'thread', autonomyMandateId: mandate._id },
      [],
      [
        {
          hook: async (input) => {
            observed.push(input.toolName);
            return { decision: 'allow' };
          },
        },
      ],
    )!;
    const run = await Run.create({
      runId: 'parent-run',
      ...wiring,
      ...(background && {
        subagentTasks: { store: new InMemorySubagentTaskStore(), scopeId: 'owner:thread' },
      }),
      graphConfig: {
        type: 'standard',
        compileOptions: { checkpointer: new MemorySaver() },
        agents: [
          {
            agentId: 'actor',
            provider: Providers.OPENAI,
            subagentConfigs: [
              {
                type: 'worker',
                name: 'Worker',
                description: 'synthetic worker',
                agentInputs: {
                  agentId: 'worker',
                  provider: Providers.OPENAI,
                  graphTools: [counter],
                },
              },
            ],
          },
        ],
      },
    });
    if (!run.Graph) throw new Error('Missing graph');
    run.Graph.setSubagentModelOverride(
      new FakeChatModel({
        responses: ['child done'],
        toolCalls: [{ id: 'child-call', name: 'counter', args: {} }],
      }),
    );
    run.Graph.overrideModel = new FakeChatModel({
      responses: ['done'],
      toolCalls: [
        {
          id: 'parent-call',
          name: Constants.SUBAGENT,
          args: {
            description: 'count once',
            subagent_type: 'worker',
            ...(background && { run_in_background: true }),
          },
        },
      ],
    });
    await run.processStream(
      { messages: [new HumanMessage('Delegate')] },
      {
        version: 'v2',
        configurable: { thread_id: 'thread', user_id: 'owner' },
        recursionLimit: 12,
      },
    );
    expect(observed).toContain(Constants.SUBAGENT);
    if (background) {
      expect(observed).not.toContain('counter');
      const result = run.getRunMessages()?.find((m) => m._getType() === 'tool');
      expect(String(result?.content)).toContain('does not support human-in-the-loop');
    } else {
      expect(observed).toContain('counter');
    }
    expect(effects).toBe(0);
  },
);
