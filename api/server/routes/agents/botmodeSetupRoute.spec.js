/** Route-level BOT MODE onboarding regression: the controller/DB boundary is mocked.
 * This deliberately does not claim to be a real MongoDB or HTTP auth integration test.
 */
const mockAgents = [];
const mockAccess = jest.fn((req, res, next, permissions) => {
  if (!req.user?.id) return res.status(401).json({ error: 'Authentication required' });
  if (permissions.includes('CREATE') && !req.user.canCreate)
    return res.status(403).json({ error: 'Forbidden' });
  next();
});
const mockPermissions = new Map();
let mockNextId = 0;
const mockGetAgents = jest.fn(async (query) =>
  mockAgents.filter(
    (agent) =>
      String(agent.author) === String(query.author) &&
      (query.name?.$in ? query.name.$in.includes(agent.name) : agent.name === query.name),
  ),
);
const mockGrantPermission = jest.fn(async ({ resourceId }) => {
  mockPermissions.set(String(resourceId), 3);
});
const mockCreateAgent = jest.fn(async (req, res) => {
  const agent = {
    ...req.body,
    id: `agent_${++mockNextId}`,
    _id: `db_${mockNextId}`,
    author: req.user.id,
    tools: req.body.tools ?? [],
  };
  mockAgents.push(agent);
  mockPermissions.set(agent._id, 3);
  res.status(201).json(agent);
});
const mockUpdateAgent = jest.fn(async (req, res) => {
  const agent = mockAgents.find((item) => item.id === req.params.id);
  Object.assign(agent, req.body);
  res.status(200).json(agent);
});
jest.mock('@librechat/api', () => ({
  generateCheckAccess:
    ({ permissions }) =>
    (req, res, next) =>
      mockAccess(req, res, next, permissions),
}));
jest.mock('~/server/middleware', () => ({
  configMiddleware: (_req, _res, next) => next(),
  canAccessAgentResource: () => (_req, _res, next) => next(),
}));
jest.mock('~/server/services/PermissionService', () => ({
  getResourcePermissionsMap: jest.fn(async () => new Map(mockPermissions)),
  grantPermission: (...args) => mockGrantPermission(...args),
}));
jest.mock('~/models', () => ({
  getRoleByName: jest.fn(),
  getAgents: (...args) => mockGetAgents(...args),
}));
jest.mock('~/server/controllers/ModelController', () => ({
  loadModels: jest.fn(async () => ({ openai: ['test-model'] })),
}));
jest.mock('~/server/controllers/agents/v1', () => ({
  createAgent: (...args) => mockCreateAgent(...args),
  updateAgent: (...args) => mockUpdateAgent(...args),
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
const express = require('express');
const supertest = require('supertest');

function response() {
  return {
    code: 200,
    payload: undefined,
    status(code) {
      this.code = code;
      return this;
    },
    json(value) {
      this.payload = value;
      return this;
    },
  };
}
const setupLayer = router.stack.find((layer) => layer.route?.path === '/botmode/setup');
const statusLayer = router.stack.find((layer) => layer.route?.path === '/botmode/setup-status');
const setup = setupLayer.route.stack.at(-1).handle;
const inspect = statusLayer.route.stack.at(-1).handle;
const request = () => ({
  user: { id: 'owner-1', role: 'USER', canCreate: true },
  body: { provider: 'openai', model: 'test-model' },
  params: {},
});

beforeEach(() => {
  mockAgents.length = 0;
  mockPermissions.clear();
  mockNextId = 0;
  jest.clearAllMocks();
});

test('creates six agents and delegates to five, then reuses identical ids', async () => {
  const first = response();
  await setup(request(), first);
  expect(first.code).toBe(200);
  expect(first.payload.created).toHaveLength(6);
  expect(mockAgents).toHaveLength(6);
  const ids = mockAgents.map((agent) => agent.id);
  const worker = mockAgents.find((agent) => agent.name === 'BOT MODE Worker');
  // V1 must not provision empty specialist shells or direct Worker tools.
  const expectedTools = {
    'BOT MODE Worker': [], RECHERCHE: ['web_search'], ANALYSE: [],
    CODE: ['execute_code'], DOCUMENTS: ['file_search'], 'RÉDACTION': [],
  };
  for (const agent of mockAgents) {
    expect(agent.tools).toEqual(expectedTools[agent.name]);
    expect(agent.instructions.length).toBeGreaterThan(300);
    expect(agent.description.length).toBeGreaterThan(30);
  }
  expect(worker.instructions).toMatch(/zéro, un ou plusieurs spécialistes/);
  expect(mockAgents.find((a) => a.name === 'CODE').instructions).toMatch(/tests exécutés/);
  expect(mockAgents.find((a) => a.name === 'RECHERCHE').instructions).toMatch(/source consultée/);
  expect(mockAgents.find((a) => a.name === 'DOCUMENTS').instructions).toMatch(/pages ou sections/);
  expect(first.payload.capabilitiesComplete).toBe(true);
  expect(first.payload.unexpectedCapabilities).toEqual([]);
  expect(first.payload.unconfiguredInstructions).toEqual([]);
  expect(worker.subagents.enabled).toBe(true);
  expect(worker.subagents.allowSelf).toBe(false); // no implicit paid child executions
  expect(worker.subagents.agent_ids).toHaveLength(5);
  expect(new Set(worker.subagents.agent_ids).size).toBe(5);
  expect(mockAgents.every((agent) => mockPermissions.has(agent._id))).toBe(true);

  const second = response();
  await setup(request(), second);
  expect(second.code).toBe(200);
  expect(second.payload.created).toHaveLength(0);
  expect(mockAgents.map((agent) => agent.id)).toEqual(ids);
  expect(mockUpdateAgent).toHaveBeenCalledTimes(1);

  const state = response();
  await inspect(request(), state);
  expect(state.code).toBe(200);
  expect(state.payload.inventoryComplete).toBe(true);
  expect(state.payload.permissionsComplete).toBe(true);
  expect(state.payload.delegationConfigured).toBe(true);
  expect(state.payload.configurationComplete).toBe(true);
});

test('read-only status and repeat onboarding flag placeholder roles and excess Worker tools without overwriting them', async () => {
  const first = response();
  await setup(request(), first);
  expect(first.code).toBe(200);
  const worker = mockAgents.find((a) => a.name === 'BOT MODE Worker');
  const analyst = mockAgents.find((a) => a.name === 'ANALYSE');
  worker.instructions = 'Tu es le Worker principal BOT MODE. Délègue uniquement selon les autorisations.';
  worker.tools = ['web_search'];
  analyst.instructions = 'Tu es le spécialiste ANALYSE de BOT MODE. Réponds en français.';
  const original = structuredClone(mockAgents);

  const status = response();
  await inspect(request(), status);
  expect(status.code).toBe(200);
  expect(status.payload.configurationComplete).toBe(false);
  expect(status.payload.unconfiguredInstructions).toEqual(['BOT MODE Worker', 'ANALYSE']);
  expect(status.payload.unexpectedCapabilities).toEqual([
    { name: 'BOT MODE Worker', unexpectedTools: ['web_search'] },
  ]);

  const again = response();
  await setup(request(), again);
  expect(again.code).toBe(200);
  expect(again.payload.capabilitiesComplete).toBe(false);
  expect(again.payload.created).toEqual([]);
  expect(mockAgents).toEqual(original); // no silent migration of user-owned agents
  expect(mockUpdateAgent).toHaveBeenCalledTimes(1); // only first-run delegation
});

test('free OpenRouter onboarding allows isolated ephemeral self children only for configured free pool', async () => {
  const { loadModels } = require('~/server/controllers/ModelController');
  loadModels.mockResolvedValueOnce({ openrouter: ['openrouter/free'] });
  const free = request();
  free.body = { provider: 'openrouter', model: 'openrouter/free' };
  const created = response();
  await setup(free, created);
  expect(created.code).toBe(200);
  expect(created.payload.created).toHaveLength(6);
  const worker = mockAgents.find((agent) => agent.name === 'BOT MODE Worker');
  expect(worker.subagents).toMatchObject({
    enabled: true,
    allowSelf: true,
  });
  expect(worker.subagents.agent_ids).toHaveLength(5);
  expect(mockAgents.every((agent) => mockPermissions.has(agent._id))).toBe(true);

  // The second setup cannot invent duplicate specialists or overwrite
  // existing (possibly user-modified) delegation choices.
  const prior = structuredClone(worker.subagents);
  const previousIds = mockAgents.map((agent) => agent.id);
  loadModels.mockResolvedValueOnce({ openrouter: ['openrouter/free'] });
  const repeated = response();
  await setup(free, repeated);
  expect(repeated.code).toBe(200);
  expect(repeated.payload.created).toHaveLength(0);
  expect(worker.subagents).toEqual(prior);
  expect(mockAgents.map((agent) => agent.id)).toEqual(previousIds);
  expect(mockUpdateAgent).toHaveBeenCalledTimes(1);
});

test('rejects an unavailable model before creating agents', async () => {
  const req = request();
  req.body.model = 'unconfigured';
  const result = response();
  await setup(req, result);
  expect(result.code).toBe(400);
  expect(mockAgents).toHaveLength(0);
});

test('refuses duplicate inventory without mutating existing records', async () => {
  mockAgents.push({ name: 'RECHERCHE', id: 'a', _id: 'a', author: 'owner-1' });
  mockAgents.push({ name: 'RECHERCHE', id: 'b', _id: 'b', author: 'owner-1' });
  const result = response();
  await setup(request(), result);
  expect(result.code).toBe(409);
  expect(mockAgents).toHaveLength(2);
  expect(mockCreateAgent).not.toHaveBeenCalled();
});

test('HTTP permission boundary blocks anonymous and non-creator setup requests', async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const identity = req.headers['x-test-identity'];
    if (identity === 'viewer') req.user = { id: 'owner-2', role: 'USER', canCreate: false };
    if (identity === 'creator') req.user = { id: 'owner-2', role: 'USER', canCreate: true };
    next();
  });
  app.use('/agents', router);
  const anonymous = await supertest(app)
    .post('/agents/botmode/setup')
    .send({ provider: 'openai', model: 'test-model' });
  expect(anonymous.status).toBe(401);
  const viewer = await supertest(app)
    .post('/agents/botmode/setup')
    .set('x-test-identity', 'viewer')
    .send({ provider: 'openai', model: 'test-model' });
  expect(viewer.status).toBe(403);
  expect(mockAgents).toHaveLength(0);
  const allowed = await supertest(app)
    .post('/agents/botmode/setup')
    .set('x-test-identity', 'creator')
    .send({ provider: 'openai', model: 'test-model' });
  expect(allowed.status).toBe(200);
  expect(mockAgents).toHaveLength(6);
  const forbiddenStatus = await supertest(app).get('/agents/botmode/setup-status');
  expect(forbiddenStatus.status).toBe(401);
  const viewerStatus = await supertest(app)
    .get('/agents/botmode/setup-status')
    .set('x-test-identity', 'viewer');
  expect(viewerStatus.status).toBe(200);
});
