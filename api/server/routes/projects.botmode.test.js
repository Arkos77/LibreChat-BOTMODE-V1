const express = require('express');
const request = require('supertest');

const mockProjection = jest.fn();
let mockUser = { id: 'user-a', tenantId: 'tenant-a' };

jest.mock('~/server/middleware/requireJwtAuth', () => (req, _res, next) => {
  req.user = mockUser;
  next();
});

jest.mock('@librechat/api', () => ({
  createProjectHandlers: () => ({
    listProjects: (_req, res) => res.status(200).json({ projects: [] }),
    createProject: (_req, res) => res.status(201).json({}),
    assignConversationToProject: (_req, res) => res.status(200).json({}),
    getProject: (_req, res) => res.status(200).json({}),
    updateProject: (_req, res) => res.status(200).json({}),
    deleteProject: (_req, res) => res.status(200).json({}),
  }),
}));

jest.mock('~/models', () => ({
  listChatProjects: jest.fn(),
  createChatProject: jest.fn(),
  getChatProject: jest.fn(),
  updateChatProject: jest.fn(),
  deleteChatProject: jest.fn(),
  assignConversationToProject: jest.fn(),
  getConvosByCursor: jest.fn(),
  getMessages: jest.fn(),
  listMtoObservations: jest.fn(),
}));

jest.mock('~/server/services/Projects/botModeProjectProjection', () => ({
  createBotModeProjectProjection: (...args) => mockProjection(...args),
}));

const router = require('./projects');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/projects', router);
  return app;
}

describe('BOT MODE project projection route', () => {
  beforeEach(() => {
    mockUser = { id: 'user-a', tenantId: 'tenant-a' };
    mockProjection.mockReset();
  });

  it('passes authenticated user and tenant to the projection', async () => {
    mockProjection.mockResolvedValue({
      projectId: '111111111111111111111111',
      conversations: [],
      totals: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, cost: 0 },
      nextCursor: null,
    });

    const res = await request(makeApp()).get('/api/projects/111111111111111111111111/bot-mode');

    expect(res.status).toBe(200);
    expect(res.body.projectId).toBe('111111111111111111111111');
    expect(mockProjection).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-a',
        tenantId: 'tenant-a',
        projectId: '111111111111111111111111',
      }),
    );
  });

  it('returns 404 when the projection refuses project ownership', async () => {
    mockProjection.mockResolvedValue(null);
    const res = await request(makeApp()).get('/api/projects/111111111111111111111111/bot-mode');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Project not found' });
  });
});
