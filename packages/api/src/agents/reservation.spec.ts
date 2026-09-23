import { z } from 'zod';
import mongoose from 'mongoose';
import { tool } from '@librechat/agents/langchain/tools';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Run, Providers, FakeChatModel } from '@librechat/agents';
import { HumanMessage } from '@librechat/agents/langchain/messages';
import { createModels, createBudgetReservationMethods } from '@librechat/data-schemas';
import { createToolExecuteHandler } from './handlers';
import { buildHITLRunWiring } from './hitl/runtime';

let server: MongoMemoryServer;
const { Balance } = createModels(mongoose);
const owner = { userId: new mongoose.Types.ObjectId().toString(), tenantId: 'budget-tenant' };
let methods: ReturnType<typeof createBudgetReservationMethods>;
beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { dbName: 'p8_fixed_budget_host' });
  methods = createBudgetReservationMethods(mongoose);
});
afterAll(async () => {
  await mongoose.disconnect();
  await server?.stop();
});
beforeEach(async () => {
  await Balance.deleteMany({});
});

type Mode =
  | 'allow'
  | 'deny'
  | 'insufficient'
  | 'database'
  | 'retry'
  | 'known_failure'
  | 'uncertain_failure';

// Synthetic fixed-cost executor only: no production provider preauthorization is implied.
async function exercise(
  path: 'direct' | 'event',
  mode: Mode,
  balanceId: string,
  runId: string,
  effects: number[],
) {
  const key = { balanceId, reservationId: `effect-${runId}`, runId };
  const counter = tool(
    async () => {
      const admission = await methods.reserveBudget(owner, {
        ...key,
        amount: 8,
        capability: 'fixed_counter',
      });
      if (!admission.created)
        throw new Error('Effect already admitted; reconcile instead of repeating');
      if (mode === 'known_failure') {
        await methods.releaseBudget(owner, key);
        throw new Error('Synthetic failure proven to occur before any effect');
      }
      if (mode === 'uncertain_failure') throw new Error('Outcome unknown: hold retained');
      const durable = await methods.getBudgetReservation(owner, key);
      expect(durable?.state).toBe('reserved');
      effects.push(8);
      await methods.consumeBudget(owner, key);
      return 'counted';
    },
    {
      name: 'fixed_counter',
      description: 'synthetic fixed-cost counter',
      schema: z.object({ proposedCost: z.number() }),
    },
  );
  const wiring = buildHITLRunWiring(
    { enabled: true, mode: 'bypass', ...(mode === 'deny' && { deny: ['fixed_counter'] }) },
    { ...owner, conversationId: 'thread' },
  )!;
  const run = await Run.create({
    runId,
    ...wiring,
    customHandlers: {
      on_tool_execute: createToolExecuteHandler({
        loadTools: async () => ({ loadedTools: [counter] }),
      }),
    },
    graphConfig: {
      type: 'standard',
      agents: [
        {
          agentId: 'agent',
          provider: Providers.OPENAI,
          ...(path === 'direct'
            ? { graphTools: [counter] }
            : {
                toolDefinitions: [
                  {
                    name: 'fixed_counter',
                    description: 'synthetic fixed-cost counter',
                    parameters: {
                      type: 'object',
                      properties: { proposedCost: { type: 'number' } },
                      required: ['proposedCost'],
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
    toolCalls: [{ id: 'call', name: 'fixed_counter', args: { proposedCost: 0 } }],
  });
  await run.processStream(
    { messages: [new HumanMessage('Synthetic effect')] },
    {
      version: 'v2',
      configurable: { thread_id: 'thread', user_id: owner.userId },
      recursionLimit: 8,
    },
  );
}

describe.each(['direct', 'event'] as const)(
  'synthetic budget admission through native %s',
  (path) => {
    test.each<Mode>([
      'allow',
      'deny',
      'insufficient',
      'database',
      'retry',
      'known_failure',
      'uncertain_failure',
    ])('%s preserves pre-effect admission and terminal accounting', async (mode) => {
      const balance = await Balance.create({
        user: owner.userId,
        tenantId: owner.tenantId,
        tokenCredits: mode === 'insufficient' ? 7 : 10,
      });
      const effects: number[] = [];
      const spy = jest.spyOn(Balance, 'findOneAndUpdate');
      if (mode === 'database')
        spy.mockImplementation(() => {
          throw new Error('Synthetic DB unavailable');
        });
      await exercise(path, mode, balance.id, 'run', effects);
      if (mode === 'retry') await exercise(path, mode, balance.id, 'run', effects);
      spy.mockRestore();
      const success = mode === 'allow' || mode === 'retry';
      expect(effects).toEqual(success ? [8] : []);
      const stored = (await Balance.findById(balance.id).lean())!;
      const expectedCredits = {
        allow: 2,
        deny: 10,
        insufficient: 7,
        database: 10,
        retry: 2,
        known_failure: 10,
        uncertain_failure: 2,
      };
      expect(stored.tokenCredits).toBe(expectedCredits[mode]);
      if (success || mode === 'known_failure' || mode === 'uncertain_failure') {
        expect(stored.budgetReservations).toHaveLength(1);
        expect(stored.budgetReservations![0].state).toBe(
          {
            allow: 'consumed',
            retry: 'consumed',
            known_failure: 'released',
            uncertain_failure: 'reserved',
          }[mode],
        );
      } else expect(stored.budgetReservations).toBeUndefined();
    });
  },
);

test('concurrent native event runs compete for one shared fixed-cost capacity', async () => {
  const balance = await Balance.create({
    user: owner.userId,
    tenantId: owner.tenantId,
    tokenCredits: 10,
  });
  const effects: number[] = [];
  await Promise.all(
    ['A', 'B'].map((runId) => exercise('event', 'allow', balance.id, runId, effects)),
  );
  expect(effects).toEqual([8]);
  const stored = (await Balance.findById(balance.id).lean())!;
  expect(stored.tokenCredits).toBe(2);
  expect(stored.budgetReservations).toHaveLength(1);
  expect(stored.budgetReservations![0].consumed).toBe(8);
});
