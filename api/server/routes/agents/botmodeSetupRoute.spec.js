/** Route-level BOT MODE onboarding regression: the controller/DB boundary is mocked.
 * This deliberately does not claim to be a real MongoDB or HTTP auth integration test.
 */
const mockAgents = [];
const mockPermissions = new Map();
let mockNextId = 0;
const mockGetAgents = jest.fn(async (query) =>
  mockAgents.filter((agent) =>
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
  generateCheckAccess: () => (_req, _res, next) => next(),
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
}));
jest.mock('./actions', () => require('express').Router());
jest.mock('./tools', () => require('express').Router());

const { v1: router } = require('./v1');

function response() {
  return {
    code: 200,
    payload: undefined,
    status(code) { this.code = code; return this; },
    json(value) { this.payload = value; return this; },
  };
}
const setupLayer = router.stack.find((layer) => layer.route?.path === '/botmode/setup');
const statusLayer = router.stack.find((layer) => layer.route?.path === '/botmode/setup-status');
const setup = setupLayer.route.stack.at(-1).handle;
const inspect = statusLayer.route.stack.at(-1).handle;
const request = () => ({ user: { id: 'owner-1', role: 'USER' }, body: { provider: 'openai', model: 'test-model' }, params: {} });

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
  expect(worker.subagents.enabled).toBe(true);
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
