import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createImprovementSkillProposalModel } from '~/models/improvementSkillProposal';
import { createImprovementSkillProposalMethods } from './improvementSkillProposal';

const owner = new mongoose.Types.ObjectId();
const otherOwner = new mongoose.Types.ObjectId();
const proposal = {
  candidateId: 'skill:task-1:call-1',
  traceId: 'trace-1',
  taskId: 'task-1',
  producerAgentId: 'agent-native-child',
  toolCallId: 'call-1',
  skillId: new mongoose.Types.ObjectId().toString(),
  expectedVersion: 3,
  payloadDigest: 'digest-1',
  diff: '-old\n+new',
  update: { body: '# New', description: 'A revised skill.' },
};

describe('durable skill improvement proposal', () => {
  let mongo: MongoMemoryServer;
  let methods: ReturnType<typeof createImprovementSkillProposalMethods>;
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    createImprovementSkillProposalModel(mongoose);
    methods = createImprovementSkillProposalMethods(mongoose);
  });
  afterEach(async () => {
    await mongoose.models.ImprovementSkillProposal.collection.deleteMany({});
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  it('persists and reads an owner-scoped proposal without a tenant ID', async () => {
    const input = { user: owner, conversationId: 'conversation-1', proposal };
    const saved = await methods.recordImprovementSkillProposal(input);
    expect(saved.record.tenantKey).toBe('');
    await expect(
      methods.getImprovementSkillProposal({ user: owner, candidateId: proposal.candidateId }),
    ).resolves.toMatchObject({ proposal });
    await expect(
      methods.getImprovementSkillProposal({ user: otherOwner, candidateId: proposal.candidateId }),
    ).resolves.toBeNull();
  });

  it('rejects mutation, deletion and oversized proposed content', async () => {
    const input = { user: owner, tenantId: 'tenant-a', conversationId: 'conversation-1', proposal };
    await methods.recordImprovementSkillProposal(input);
    const model = mongoose.models.ImprovementSkillProposal;
    await expect(model.updateOne({}, { $set: { 'proposal.diff': 'changed' } })).rejects.toThrow(
      /immutable/i,
    );
    await expect(model.deleteOne({})).rejects.toThrow(/immutable/i);
    await expect(
      methods.recordImprovementSkillProposal({
        ...input,
        proposal: {
          ...proposal,
          candidateId: 'skill:task-2:call-2',
          update: { ...proposal.update, body: 'x'.repeat(530000) },
        },
      }),
    ).rejects.toThrow(/limit/i);
    expect(await model.countDocuments({})).toBe(1);
  });

  it('coalesces concurrent identical native calls while retaining distinct edits', async () => {
    const input = { user: owner, tenantId: 'tenant-a', conversationId: 'conversation-1', proposal };
    const duplicate = {
      ...input,
      proposal: { ...proposal, candidateId: 'skill:task-1:call-2', toolCallId: 'call-2' },
    };
    const [first, second] = await Promise.all([
      methods.recordImprovementSkillProposal(input),
      methods.recordImprovementSkillProposal(duplicate),
    ]);
    expect(first.record.proposal.candidateId).toBe(second.record.proposal.candidateId);
    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
    expect(await mongoose.models.ImprovementSkillProposal.countDocuments({})).toBe(1);
    const changed = await methods.recordImprovementSkillProposal({
      ...duplicate,
      proposal: {
        ...duplicate.proposal,
        candidateId: 'skill:task-1:call-3',
        toolCallId: 'call-3',
        update: { ...proposal.update, body: '# Different' },
      },
    });
    expect(changed.replayed).toBe(false);
    expect(await mongoose.models.ImprovementSkillProposal.countDocuments({})).toBe(2);
  });

  it('keeps equal edits separate across tasks, owners and tenants', async () => {
    const base = { user: owner, tenantId: 'tenant-a', conversationId: 'conversation-1', proposal };
    await methods.recordImprovementSkillProposal(base);
    const variants = [
      {
        ...base,
        proposal: {
          ...proposal,
          candidateId: 'skill:task-2:call-2',
          taskId: 'task-2',
          toolCallId: 'call-2',
        },
      },
      {
        ...base,
        user: otherOwner,
        proposal: { ...proposal, candidateId: 'skill:task-1:call-3', toolCallId: 'call-3' },
      },
      {
        ...base,
        tenantId: 'tenant-b',
        proposal: { ...proposal, candidateId: 'skill:task-1:call-4', toolCallId: 'call-4' },
      },
    ];
    for (const variant of variants) {
      expect((await methods.recordImprovementSkillProposal(variant)).replayed).toBe(false);
    }
    expect(await mongoose.models.ImprovementSkillProposal.countDocuments({})).toBe(4);
  });

  it('replays only the exact content and isolates owner and tenant', async () => {
    const input = { user: owner, tenantId: 'tenant-a', conversationId: 'conversation-1', proposal };
    expect((await methods.recordImprovementSkillProposal(input)).replayed).toBe(false);
    expect((await methods.recordImprovementSkillProposal(input)).replayed).toBe(true);
    await expect(
      methods.recordImprovementSkillProposal({
        ...input,
        proposal: { ...proposal, update: { ...proposal.update, body: '# Different' } },
      }),
    ).rejects.toThrow(/conflict/i);
    await expect(
      methods.getImprovementSkillProposal({
        user: otherOwner,
        tenantId: 'tenant-a',
        candidateId: proposal.candidateId,
      }),
    ).resolves.toBeNull();
    await expect(
      methods.getImprovementSkillProposal({
        user: owner,
        tenantId: 'tenant-b',
        candidateId: proposal.candidateId,
      }),
    ).resolves.toBeNull();
    await expect(
      methods.getImprovementSkillProposal({
        user: owner,
        tenantId: 'tenant-a',
        candidateId: proposal.candidateId,
      }),
    ).resolves.toMatchObject({ proposal });
  });
});
