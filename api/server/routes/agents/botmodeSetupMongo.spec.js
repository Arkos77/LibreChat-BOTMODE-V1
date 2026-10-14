/** Real MongoDB route-state test. Native create/update and permission service are
 * deliberate DB-backed adapters; this is NOT a fully native HTTP integration. */
const mongoose = require('mongoose');
const express = require('express');
const supertest = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { agentSchema, aclEntrySchema } = require('@librechat/data-schemas');
const {
  PermissionBits,
  PrincipalType,
  ResourceType,
  PrincipalModel,
} = require('librechat-data-provider');
let mongo;
let Agent;
let Acl;
const ownerId = new mongoose.Types.ObjectId();
const ownerBits = PermissionBits.VIEW | PermissionBits.EDIT | PermissionBits.DELETE;
const mockGetAgents = jest.fn(async ({ author, name }) =>
  Agent.find({ author, ...(name ? { name } : {}) }),
);
const mockGrant = jest.fn(async ({ principalId, resourceId }) => {
  await Acl.updateOne(
    {
      principalType: PrincipalType.USER,
      principalId,
      resourceType: ResourceType.AGENT,
      resourceId,
    },
    { $set: { principalModel: PrincipalModel.USER, permBits: ownerBits, grantedBy: principalId } },
    { upsert: true },
  );
});
const mockPerms = jest.fn(async ({ userId, resourceIds }) => {
  const grants = await Acl.find({ principalId: userId, resourceId: { $in: resourceIds } });
  return new Map(grants.map((entry) => [String(entry.resourceId), entry.permBits]));
});
const mockCreate = jest.fn(async (req, res) => {
  const created = await Agent.create({
    ...req.body,
    id: `agent_${new mongoose.Types.ObjectId()}`,
    author: req.user.id,
  });
  await mockGrant({ principalId: req.user.id, resourceId: created._id });
  res.status(201).json(created);
});
const mockUpdate = jest.fn(async (req, res) => {
  const updated = await Agent.findOneAndUpdate(
    { id: req.params.id, author: req.user.id },
    { $set: req.body },
    { new: true },
  );
  if (!updated) return res.status(404).json({ error: 'missing worker' });
  res.status(200).json(updated);
});
jest.mock('@librechat/api', () => ({ generateCheckAccess: () => (_q, _r, next) => next() }));
jest.mock('~/server/middleware', () => ({
  configMiddleware: (_q, _r, next) => next(),
  canAccessAgentResource: () => (_q, _r, next) => next(),
}));
jest.mock('~/server/services/PermissionService', () => ({
  getResourcePermissionsMap: (...args) => mockPerms(...args),
  grantPermission: (...args) => mockGrant(...args),
}));
jest.mock('~/models', () => ({
  getRoleByName: jest.fn(),
  getAgents: (...args) => mockGetAgents(...args),
}));
jest.mock('~/server/controllers/ModelController', () => ({
  loadModels: jest.fn(async () => ({ openai: ['test-model'] })),
}));
jest.mock('~/server/controllers/agents/v1', () => ({
  createAgent: (...args) => mockCreate(...args),
  updateAgent: (...args) => mockUpdate(...args),
  getAgentCategories: jest.fn(),
  getAgent: jest.fn(),
  getAgentVersions: jest.fn(),
  duplicateAgent: jest.fn(),
  revertAgentVersion: jest.fn(),
  getListAgents: jest.fn(),
  uploadAgentAvatar: jest.fn(),
  deleteAgent: jest.fn(),
}));
jest.mock('./actions', () => require('express').Router());
jest.mock('./tools', () => require('express').Router());
const { v1: router } = require('./v1');
const setup = router.stack
  .find((x) => x.route?.path === '/botmode/setup')
  .route.stack.at(-1).handle;
const inspect = router.stack
  .find((x) => x.route?.path === '/botmode/setup-status')
  .route.stack.at(-1).handle;
const req = () => ({
  user: { id: String(ownerId), role: 'USER' },
  params: {},
  body: { provider: 'openai', model: 'test-model' },
});
const res = () => ({
  code: 200,
  payload: null,
  status(code) {
    this.code = code;
    return this;
  },
  json(value) {
    this.payload = value;
    return this;
  },
});
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  Agent = mongoose.models.Agent || mongoose.model('Agent', agentSchema);
  Acl = mongoose.models.AclEntry || mongoose.model('AclEntry', aclEntrySchema);
}, 30000);
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => {
  await Agent.deleteMany({});
  await Acl.deleteMany({});
  jest.clearAllMocks();
});
test('setup route commits six distinct agents, owner ACL and stable second initialization', async () => {
  const first = res();
  await setup(req(), first);
  expect(first.code).toBe(200);
  expect(first.payload.created).toHaveLength(6);
  const initial = await Agent.find({ author: ownerId }).lean();
  expect(initial).toHaveLength(6);
  expect(new Set(initial.map((a) => a.name)).size).toBe(6);
  const grants = await Acl.find({ principalId: String(ownerId) }).lean();
  expect(grants).toHaveLength(6);
  expect(
    grants.every(
      (g) =>
        (g.permBits & (PermissionBits.VIEW | PermissionBits.EDIT)) ===
        (PermissionBits.VIEW | PermissionBits.EDIT),
    ),
  ).toBe(true);
  const worker = initial.find((a) => a.name === 'BOT MODE Worker');
  expect(worker.subagents.enabled).toBe(true);
  expect(new Set(worker.subagents.agent_ids).size).toBe(5);
  const ids = new Set(initial.map((a) => a.id));
  const second = res();
  await setup(req(), second);
  expect(second.code).toBe(200);
  expect(second.payload.created).toHaveLength(0);
  const after = await Agent.find({ author: ownerId }).lean();
  expect(after).toHaveLength(6);
  expect(new Set(after.map((a) => a.id))).toEqual(ids);
  const state = res();
  await inspect(req(), state);
  expect(state.code).toBe(200);
  expect(state.payload).toMatchObject({
    inventoryComplete: true,
    permissionsComplete: true,
    delegationConfigured: true,
  });
});

test('HTTP POST and GET travel through Express with a test-authenticated owner', async () => {
  const app = express();
  app.use(express.json());
  // Explicit test-only identity injection: NOT production authentication.
  app.use((request, _response, next) => {
    request.user = { id: String(ownerId), role: 'USER' };
    next();
  });
  app.use('/agents', router);
  const first = await supertest(app).post('/agents/botmode/setup').send({
    provider: 'openai',
    model: 'test-model',
  });
  expect(first.status).toBe(200);
  expect(first.body.created).toHaveLength(6);
  expect(await Agent.countDocuments({ author: ownerId })).toBe(6);

  const second = await supertest(app).post('/agents/botmode/setup').send({
    provider: 'openai',
    model: 'test-model',
  });
  expect(second.status).toBe(200);
  expect(second.body.created).toHaveLength(0);
  expect(await Agent.countDocuments({ author: ownerId })).toBe(6);

  const inventory = await supertest(app).get('/agents/botmode/setup-status');
  expect(inventory.status).toBe(200);
  expect(inventory.body).toMatchObject({
    inventoryComplete: true,
    permissionsComplete: true,
    delegationConfigured: true,
  });
});
