jest.mock('mongoose', () => {
  const rows = new Map();
  const keyOf = (scope) =>
    JSON.stringify([
      scope.userId,
      scope.tenantId,
      scope.conversationId,
      scope.parentResponseMessageId,
    ]);
  class Schema {
    static Types = { Mixed: class Mixed {} };
    index() {}
  }
  const model = {
    collection: { createIndex: jest.fn(async () => 'original_parent_mission_unique') },
    updateOne: jest.fn(async (scope, operation) => {
      const key = keyOf(scope);
      if (!rows.has(key)) {
        rows.set(key, {
          _id: key,
          ...operation.$setOnInsert,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }),
    findOne: jest.fn((scope) => ({
      select: () => ({
        lean: async () => {
          const record = rows.get(keyOf(scope));
          return record != null && (scope.agentId == null || record.agentId === scope.agentId)
            ? structuredClone(record)
            : null;
        },
      }),
    })),
    deleteMany: jest.fn(async (scope) => {
      for (const [key, record] of rows) {
        if (record.userId !== scope.userId || record.tenantId !== scope.tenantId) continue;
        if (
          scope.conversationId != null &&
          !scope.conversationId.$in.includes(record.conversationId)
        )
          continue;
        rows.delete(key);
      }
    }),
  };
  return { Schema, models: {}, model: () => model, __testModel: model, __rows: rows };
});

const mongoose = require('mongoose');
const {
  saveNativeMissionWakeupOrigin,
  getNativeMissionWakeupOrigin,
  deleteNativeMissionWakeupOrigins,
} = require('./nativeMissionWakeupOriginStore');

const mission = { missionId: 'mission-1', taskId: 'task-1', objective: 'Analyze' };
const original = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  conversationId: 'conversation-1',
  parentResponseMessageId: 'response-1',
  agentId: 'agent-1',
  createdAt: 12345678,
  plan: { planId: 'plan-1', mission },
  orchestratorMission: { mission },
  capabilityAttestation: { agents: ['agent-1'] },
  botMode: { version: 1, mode: 'analyze', workerAgentId: 'agent-1' },
};
beforeEach(() => mongoose.__rows.clear());

describe('immutable BOT MODE mission wakeup origin', () => {
  it('serves identical mission for successive sibling notifications after slot replacement', async () => {
    await saveNativeMissionWakeupOrigin(original);
    const scope = { ...original };
    const first = await getNativeMissionWakeupOrigin(scope);
    const second = await getNativeMissionWakeupOrigin(scope);
    expect(first).toMatchObject({ planId: 'plan-1', plan: original.plan });
    expect(second).toEqual(first);
    expect(mongoose.__rows.size).toBe(1);
  });

  it('accepts exact retry but rejects replacement of an original mission', async () => {
    await saveNativeMissionWakeupOrigin(original);
    await expect(saveNativeMissionWakeupOrigin(original)).resolves.toBeDefined();
    await expect(
      saveNativeMissionWakeupOrigin({
        ...original,
        orchestratorMission: { mission: { ...mission, objective: 'Different' } },
        plan: { planId: 'plan-1', mission: { ...mission, objective: 'Different' } },
      }),
    ).rejects.toThrow('MISSION_ORIGIN_IMMUTABLE_CONFLICT');
    expect(mongoose.__rows.size).toBe(1);
  });

  it('refuses foreign owner, tenant and agent scopes', async () => {
    await saveNativeMissionWakeupOrigin(original);
    await expect(
      getNativeMissionWakeupOrigin({ ...original, userId: 'other' }),
    ).resolves.toBeNull();
    await expect(
      getNativeMissionWakeupOrigin({ ...original, tenantId: 'other' }),
    ).resolves.toBeNull();
    await expect(
      getNativeMissionWakeupOrigin({ ...original, agentId: 'other' }),
    ).resolves.toBeNull();
  });

  it('detects tampered immutable origin data', async () => {
    await saveNativeMissionWakeupOrigin(original);
    const stored = [...mongoose.__rows.values()][0];
    stored.plan = { ...stored.plan, planId: 'forged-plan' };
    await expect(getNativeMissionWakeupOrigin(original)).rejects.toThrow(
      'MISSION_ORIGIN_INTEGRITY_FAILED',
    );
  });

  it('prunes by authorized user, tenant, and conversation', async () => {
    await saveNativeMissionWakeupOrigin(original);
    await saveNativeMissionWakeupOrigin({
      ...original,
      conversationId: 'conversation-2',
      parentResponseMessageId: 'response-2',
    });
    await deleteNativeMissionWakeupOrigins({
      userId: 'user-1',
      tenantId: 'tenant-1',
      conversationIds: ['conversation-1'],
    });
    await expect(getNativeMissionWakeupOrigin(original)).resolves.toBeNull();
    await expect(
      getNativeMissionWakeupOrigin({
        ...original,
        conversationId: 'conversation-2',
        parentResponseMessageId: 'response-2',
      }),
    ).resolves.toBeDefined();
  });
});
