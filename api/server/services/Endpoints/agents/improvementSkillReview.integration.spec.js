const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createModels } = require('@librechat/data-schemas');
const db = require('~/models');
const { recordSkillImprovementProposal } = require('./improvementSkillProposal');
const {
  loadSkillImprovementReview,
  decideSkillImprovementReview,
} = require('./improvementSkillReview');

const user = new mongoose.Types.ObjectId();
const otherUser = new mongoose.Types.ObjectId();
const skillId = new mongoose.Types.ObjectId().toString();
const candidateId = 'skill:native-task-1:tool-call-1';
const tests = [{ id: 'evidence', field: 'body', operator: 'includes', expected: 'Evidence' }];

describe('P10 durable skill review and publication flow', () => {
  let mongo;
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    createModels(mongoose);
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  it('persists proposal, checks independently, then binds one human decision to the exact diff', async () => {
    const req = { user: { id: user.toString(), role: 'USER' } };
    const tenantId = 'tenant-a';
    const published = jest.fn(async () => ({ status: 'updated' }));
    const proposal = {
      toolCallId: 'tool-call-1',
      skillId,
      expectedVersion: 3,
      diff: '-old\n+Evidence',
      update: { body: '# Revised\nEvidence', description: 'Improved skill.' },
    };
    const recorded = await recordSkillImprovementProposal({
      req,
      tenantId,
      conversationId: 'conversation-1',
      traceId: 'trace-1',
      taskId: 'native-task-1',
      producerAgentId: 'agent-child',
      proposal,
      persistProposal: db.recordImprovementSkillProposal,
      persistCandidate: db.recordImprovementCandidate,
      persistLifecycleEvent: db.recordImprovementLifecycleEvent,
      getHostTests: () => tests,
    });
    expect(recorded.candidateId).toBe(candidateId);
    const dependencies = {
      req,
      tenantId,
      candidateId,
      getProposal: db.getImprovementSkillProposal,
      getCandidate: db.getImprovementCandidate,
      listEvents: db.listImprovementLifecycleEvents,
      recordEvent: db.recordImprovementLifecycleEvent,
      canView: jest.fn(async () => true),
      publish: published,
    };
    const review = await loadSkillImprovementReview(dependencies);
    expect(review).toMatchObject({ diff: '-old\n+Evidence', quality: 'VERIFIED', reviewed: false });
    await expect(
      loadSkillImprovementReview({ ...dependencies, req: { user: { id: otherUser.toString() } } }),
    ).rejects.toThrow();
    await expect(
      loadSkillImprovementReview({ ...dependencies, tenantId: 'tenant-b' }),
    ).rejects.toThrow();
    const input = {
      ...dependencies,
      decision: 'approve',
      payloadDigest: review.payloadDigest,
      snapshotDigest: review.snapshotDigest,
    };
    expect(await decideSkillImprovementReview(input)).toMatchObject({ status: 'updated' });
    expect(published).toHaveBeenCalledTimes(1);
    const lifecycle = await db.listImprovementLifecycleEvents({ user, tenantId, candidateId });
    expect(lifecycle.map((item) => item.type)).toEqual(
      expect.arrayContaining(['VALIDATING', 'VERIFIED', 'APPROVED', 'COMMITTED']),
    );
    await expect(decideSkillImprovementReview(input)).rejects.toThrow(/already/i);
    expect(published).toHaveBeenCalledTimes(1);
  });
});
