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
    const published = jest.fn(async (input) => {
      await input.onAuthorized?.({
        actorId: user.toString(),
        skillId,
        expectedVersion: proposal.expectedVersion,
      });
      return { status: 'updated' };
    });
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
    const repeated = await recordSkillImprovementProposal({
      req,
      tenantId,
      conversationId: 'conversation-1',
      traceId: 'trace-1',
      taskId: 'native-task-1',
      producerAgentId: 'agent-child',
      proposal: { ...proposal, toolCallId: 'tool-call-2' },
      persistProposal: db.recordImprovementSkillProposal,
      persistCandidate: db.recordImprovementCandidate,
      persistLifecycleEvent: db.recordImprovementLifecycleEvent,
      getHostTests: () => tests,
    });
    expect(repeated.candidateId).toBe(candidateId);
    expect(await mongoose.models.ImprovementSkillProposal.countDocuments({})).toBe(1);
    expect(await mongoose.models.ImprovementCandidate.countDocuments({})).toBe(1);
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
      expect.arrayContaining(['VALIDATING', 'VERIFIED', 'APPROVED', 'AUTHORIZED', 'COMMITTED']),
    );
    await expect(decideSkillImprovementReview(input)).rejects.toThrow(/already/i);
    expect(published).toHaveBeenCalledTimes(1);
  });

  it('recovers a committed native mutation exactly once after the COMMITTED journal write fails', async () => {
    const req = { user: { id: user.toString(), role: 'USER' } };
    const tenantId = 'tenant-step9';
    const created = await db.createSkill({
      name: 'step9-recovery-skill',
      description: 'Skill used to prove durable BOT MODE recovery.',
      body: '# Step 9\n\nOriginal body',
      frontmatter: {
        name: 'step9-recovery-skill',
        description: 'Skill used to prove durable BOT MODE recovery.',
      },
      author: user,
      authorName: 'BOT MODE Test',
    });
    const nativeSkillId = created.skill._id.toString();
    const proposal = {
      toolCallId: 'tool-call-recovery',
      skillId: nativeSkillId,
      expectedVersion: created.skill.version,
      diff: '-Original body\n+Recovered Evidence',
      update: {
        body: '# Step 9\n\nRecovered Evidence',
        description: 'Recovered native skill update.',
      },
    };
    const recorded = await recordSkillImprovementProposal({
      req,
      tenantId,
      conversationId: 'conversation-step9',
      traceId: 'trace-step9',
      taskId: 'native-task-step9',
      producerAgentId: 'agent-step9',
      proposal,
      persistProposal: db.recordImprovementSkillProposal,
      persistCandidate: db.recordImprovementCandidate,
      persistLifecycleEvent: db.recordImprovementLifecycleEvent,
      getHostTests: () => tests,
    });

    const nativeUpdate = jest.fn((input) => db.updateSkill(input));
    const publish = jest.fn(async (input) => {
      await input.onAuthorized?.({
        actorId: user.toString(),
        skillId: input.skillId,
        expectedVersion: input.expectedVersion,
        payloadDigest: input.disposition.payloadDigest,
      });
      return nativeUpdate({
        id: input.skillId,
        expectedVersion: input.expectedVersion,
        update: input.update,
        improvementMutation: {
          candidateId: input.disposition.candidateId,
          payloadDigest: input.disposition.payloadDigest,
          expectedVersion: input.expectedVersion,
        },
      });
    });

    let failCommitOnce = true;
    const recordEvent = jest.fn(async (input) => {
      if (input.event.type === 'COMMITTED' && failCommitOnce) {
        failCommitOnce = false;
        throw new Error('simulated COMMITTED journal outage');
      }
      return db.recordImprovementLifecycleEvent(input);
    });

    const dependencies = {
      req,
      tenantId,
      candidateId: recorded.candidateId,
      getProposal: db.getImprovementSkillProposal,
      getCandidate: db.getImprovementCandidate,
      listEvents: db.listImprovementLifecycleEvents,
      recordEvent,
      canView: jest.fn(async () => true),
      getSkillById: db.getSkillById,
      publish,
    };
    const review = await loadSkillImprovementReview(dependencies);
    const input = {
      ...dependencies,
      decision: 'approve',
      payloadDigest: review.payloadDigest,
      snapshotDigest: review.snapshotDigest,
    };

    const first = await decideSkillImprovementReview(input);
    expect(first).toMatchObject({ status: 'updated', observationPending: true });

    const afterFirst = await db.getSkillById(nativeSkillId);
    expect(afterFirst.version).toBe(created.skill.version + 1);
    expect(afterFirst.lastImprovementMutation).toEqual({
      candidateId: recorded.candidateId,
      payloadDigest: review.payloadDigest,
      expectedVersion: created.skill.version,
    });
    expect(nativeUpdate).toHaveBeenCalledTimes(1);

    const second = await decideSkillImprovementReview(input);
    expect(second).toEqual({ status: 'updated', recovered: true });

    const afterSecond = await db.getSkillById(nativeSkillId);
    expect(afterSecond.version).toBe(created.skill.version + 1);
    expect(nativeUpdate).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledTimes(1);

    const lifecycle = await db.listImprovementLifecycleEvents({
      user,
      tenantId,
      candidateId: recorded.candidateId,
    });
    expect(lifecycle.filter((item) => item.type === 'APPROVED')).toHaveLength(1);
    expect(lifecycle.filter((item) => item.type === 'AUTHORIZED')).toHaveLength(1);
    expect(lifecycle.filter((item) => item.type === 'COMMITTED')).toHaveLength(1);
  });
});
