import mongoose from 'mongoose';
import { executeHooks } from '@librechat/agents';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createAutonomyMandateMethods } from '@librechat/data-schemas';
import type { AutonomyMandateMethods } from '@librechat/data-schemas';
import type { PreToolUseHookInput } from '@librechat/agents';
import { createMandateApprovalHook } from './mandate';
import { buildHITLRunWiring } from './runtime';

let server: MongoMemoryServer;
let methods: AutonomyMandateMethods;
const scope = { userId: 'owner', tenantId: 'tenant' };
const binding = { actorId: 'actor', conversationId: 'thread' };
const context = { ...scope, conversationId: 'thread' };
const rules = {
  allowedCapabilities: ['counter'],
  deniedCapabilities: ['purchase'],
  validFrom: new Date('2026-01-01'),
  expiresAt: new Date('2027-01-01'),
  reason: 'synthetic mandate',
};
const input: PreToolUseHookInput = {
  hook_event_name: 'PreToolUse',
  toolName: 'counter',
  executingAgentId: 'actor',
  runId: 'run',
  threadId: 'thread',
  toolUseId: 'call',
  stepId: 'step',
  turn: 0,
  toolInput: {},
};
beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { dbName: 'p8_mandate_hook_tests' });
  methods = createAutonomyMandateMethods(mongoose);
});
afterAll(async () => {
  await mongoose.disconnect();
  await server?.stop();
});
beforeEach(async () => {
  await mongoose.models.AutonomyMandate.deleteMany({});
});

const cases = [
  'active',
  'missing',
  'not_started',
  'expired',
  'revoked',
  'capability',
  'deny',
  'actor',
  'user',
  'tenant',
  'conversation',
  'thread',
  'invalid',
  'lookup_error',
  'stronger_deny',
] as const;
test.each(cases)('effect-time mandate decision: %s', async (mode) => {
  const created = await methods.createAutonomyMandate(scope, binding, rules);
  const ctx = { ...context, autonomyMandateId: created._id };
  const call = { ...input };
  if (mode === 'missing') ctx.autonomyMandateId = 'missing';
  if (mode === 'capability') call.toolName = 'unlisted';
  if (mode === 'actor') call.executingAgentId = 'child';
  if (mode === 'user') ctx.userId = 'other';
  if (mode === 'tenant') ctx.tenantId = 'other';
  if (mode === 'conversation') ctx.conversationId = 'other';
  if (mode === 'thread') call.threadId = 'other';
  if (mode === 'revoked') await methods.revokeAutonomyMandate(scope, created._id, 1, 'stop');
  if (mode === 'deny')
    await methods.reviseAutonomyMandate(scope, created._id, 1, {
      ...rules,
      deniedCapabilities: ['counter'],
    });
  if (mode === 'expired')
    await methods.reviseAutonomyMandate(scope, created._id, 1, {
      ...rules,
      validFrom: new Date(0),
      expiresAt: new Date(1),
    });
  if (mode === 'not_started')
    await methods.reviseAutonomyMandate(scope, created._id, 1, {
      ...rules,
      validFrom: new Date('2090-01-01'),
      expiresAt: new Date('2091-01-01'),
    });
  if (mode === 'invalid')
    await mongoose.models.AutonomyMandate.updateOne(
      { _id: created._id },
      { $set: { version: 99 } },
    );
  const wiring = buildHITLRunWiring(
    { enabled: true, mode: 'bypass', ...(mode === 'stronger_deny' && { deny: ['counter'] }) },
    ctx,
  )!;
  if (mode === 'lookup_error')
    jest.spyOn(mongoose.models.AutonomyMandate, 'findOne').mockImplementationOnce(() => {
      throw new Error('synthetic DB failure');
    });
  const result = await executeHooks({ registry: wiring.hooks, input: call });
  expect(result.decision).toBe(mode === 'active' ? 'allow' : 'deny');
});

test('one captured hook rereads versions, expiry and revocation without mutating prior evidence', async () => {
  const created = await methods.createAutonomyMandate(scope, binding, rules);
  let now = rules.expiresAt.getTime() - 1;
  const read = jest.fn(methods.getAutonomyMandate);
  const hook = createMandateApprovalHook(
    { ...context, autonomyMandateId: created._id },
    { read, now: () => now },
  );
  const signal = new AbortController().signal;
  const first = await hook(input, signal);
  expect(first).toMatchObject({ decision: 'allow' });
  expect(JSON.parse(first!.reason!)).toMatchObject({ version: 1, mandateId: created._id });
  now += 1;
  expect(await hook(input, signal)).toMatchObject({
    decision: 'deny',
    reason: expect.stringContaining('expired'),
  });
  const revised = await methods.reviseAutonomyMandate(scope, created._id, 1, {
    ...rules,
    expiresAt: new Date(now + 1000),
  });
  expect(revised.version).toBe(2);
  expect(await hook(input, signal)).toMatchObject({
    decision: 'allow',
    reason: expect.stringContaining('"version":2'),
  });
  await methods.revokeAutonomyMandate(scope, created._id, 2, 'owner stopped');
  expect(await hook(input, signal)).toMatchObject({
    decision: 'deny',
    reason: expect.stringContaining('revoked'),
  });
  expect(JSON.parse(first!.reason!)).toMatchObject({ version: 1 });
  expect(read).toHaveBeenCalledTimes(4);
});

test('legacy remains optional, but a selected mandate cannot bypass disabled authorization', () => {
  expect(buildHITLRunWiring(undefined)).toBeUndefined();
  expect(() =>
    buildHITLRunWiring(undefined, { ...context, autonomyMandateId: 'required' }),
  ).toThrow('require');
});
