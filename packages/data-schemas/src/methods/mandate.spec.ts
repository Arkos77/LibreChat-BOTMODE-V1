import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createAutonomyMandateMethods } from './mandate';
import { tenantStorage } from '~/config/tenantContext';

let server: MongoMemoryServer;
let methods: ReturnType<typeof createAutonomyMandateMethods>;
const scope = { userId: 'owner', tenantId: 'tenant' };
const binding = { actorId: 'actor', conversationId: 'conversation' };
const rules = {
  allowedCapabilities: ['counter'],
  deniedCapabilities: ['purchase'],
  validFrom: new Date('2026-01-01'),
  expiresAt: new Date('2027-01-01'),
  reason: 'synthetic mandate',
};
beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { dbName: 'p8_mandate_tests' });
  methods = createAutonomyMandateMethods(mongoose);
});
afterAll(async () => {
  await mongoose.disconnect();
  await server?.stop();
});
beforeEach(async () => {
  await mongoose.models.AutonomyMandate.deleteMany({});
});

test('persists identity, owner, scope, rules and immutable revision evidence', async () => {
  const created = await methods.createAutonomyMandate(scope, binding, rules);
  const freshReader = createAutonomyMandateMethods(mongoose);
  expect(await freshReader.getAutonomyMandate(scope, created._id)).toEqual(created);
  expect(created).toMatchObject({
    ...scope,
    ...binding,
    version: 1,
    revisions: [
      {
        ...rules,
        version: 1,
        status: 'active',
        changedBy: scope.userId,
        changedAt: expect.any(Date),
      },
    ],
  });
});

test('CAS revisions preserve old meaning and revocation is terminal', async () => {
  const initial = await methods.createAutonomyMandate(scope, binding, rules);
  const results = await Promise.allSettled([
    methods.reviseAutonomyMandate(scope, initial._id, 1, {
      ...rules,
      allowedCapabilities: ['read'],
    }),
    methods.reviseAutonomyMandate(scope, initial._id, 1, {
      ...rules,
      allowedCapabilities: ['write'],
    }),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  const current = (await methods.getAutonomyMandate(scope, initial._id))!;
  expect(current.version).toBe(2);
  expect(current.revisions[0]).toEqual(initial.revisions[0]);
  const revoked = await methods.revokeAutonomyMandate(scope, initial._id, 2, 'owner stopped');
  expect(revoked).toMatchObject({ version: 3 });
  expect(revoked.revisions[2]).toMatchObject({
    status: 'revoked',
    changedBy: 'owner',
    reason: 'owner stopped',
  });
  expect(revoked.revisions.slice(0, 2)).toEqual(current.revisions);
  await expect(methods.reviseAutonomyMandate(scope, initial._id, 3, rules)).rejects.toThrow(
    'conflict',
  );
});

test.each([
  { userId: 'other', tenantId: 'tenant' },
  { userId: 'owner', tenantId: 'other' },
  { userId: 'owner' },
])('scope cannot read or revoke another authority: %j', async (other) => {
  const created = await methods.createAutonomyMandate(scope, binding, rules);
  expect(await methods.getAutonomyMandate(other, created._id)).toBeNull();
  await expect(methods.revokeAutonomyMandate(other, created._id, 1, 'forged')).rejects.toThrow(
    'conflict',
  );
  expect((await methods.getAutonomyMandate(scope, created._id))!.version).toBe(1);
});

test('rejects malformed temporal rules and malformed versions', async () => {
  await expect(
    methods.createAutonomyMandate(scope, binding, { ...rules, expiresAt: rules.validFrom }),
  ).rejects.toThrow();
  const created = await methods.createAutonomyMandate(scope, binding, rules);
  await expect(methods.reviseAutonomyMandate(scope, created._id, 1.5, rules)).rejects.toThrow(
    'revision',
  );
  expect((await methods.getAutonomyMandate(scope, created._id))!.version).toBe(1);
});

test('ambient tenant context cannot replace an explicit owner scope', async () => {
  const created = await methods.createAutonomyMandate(scope, binding, rules);
  await expect(
    tenantStorage.run({ tenantId: 'tenant' }, async () =>
      methods.getAutonomyMandate({ ...scope, tenantId: 'other' }, created._id),
    ),
  ).rejects.toThrow('scope');
  await expect(
    tenantStorage.run({ tenantId: 'tenant' }, async () =>
      methods.createAutonomyMandate({ ...scope, tenantId: 'other' }, binding, rules),
    ),
  ).rejects.toThrow('scope');
});
