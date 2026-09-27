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
