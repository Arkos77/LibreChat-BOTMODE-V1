const express = require('express');
const request = require('supertest');

// Only infrastructure adapters are mocked. The express-rate-limit middleware,
// its in-memory store, request counting, and 429 handling run for real.
jest.mock('@librechat/api', () => ({
  limiterCache: jest.fn(() => undefined),
  removePorts: jest.fn((req) => req.ip),
}));
jest.mock('@librechat/data-schemas', () => ({
  getTenantId: jest.fn(() => undefined),
}));

const {
  mcpOAuthInitiateLimiter,
  mcpOAuthCallbackLimiter,
} = require('./mcpOAuthLimiter');

describe('MCP OAuth limiters with real express-rate-limit', () => {
  let app;
  const previousInitiateMax = process.env.MCP_OAUTH_INITIATE_MAX;
  const previousCallbackMax = process.env.MCP_OAUTH_CALLBACK_MAX;
  const previousInitiateWindow = process.env.MCP_OAUTH_INITIATE_WINDOW;
  const previousCallbackWindow = process.env.MCP_OAUTH_CALLBACK_WINDOW;

  beforeAll(() => {
    process.env.MCP_OAUTH_INITIATE_MAX = '2';
    process.env.MCP_OAUTH_CALLBACK_MAX = '2';
    process.env.MCP_OAUTH_INITIATE_WINDOW = '5';
    process.env.MCP_OAUTH_CALLBACK_WINDOW = '5';

    app = express();
    // Test-only authenticated principal. Production JWT auth is tested by the
    // existing route suite; this exercises the real limiter after that guard.
    app.use((req, _res, next) => {
      if (typeof req.get('x-test-user') === 'string') {
        req.user = { id: req.get('x-test-user'), tenantId: 'tenant-test' };
      }
      next();
    });
    app.get('/api/mcp/:serverName/oauth/initiate', mcpOAuthInitiateLimiter, (_req, res) =>
      res.sendStatus(204),
    );
    app.get('/api/mcp/:serverName/oauth/callback', mcpOAuthCallbackLimiter, (_req, res) =>
      res.sendStatus(204),
    );
  });

  afterAll(() => {
    for (const [key, original] of [
      ['MCP_OAUTH_INITIATE_MAX', previousInitiateMax],
      ['MCP_OAUTH_CALLBACK_MAX', previousCallbackMax],
      ['MCP_OAUTH_INITIATE_WINDOW', previousInitiateWindow],
      ['MCP_OAUTH_CALLBACK_WINDOW', previousCallbackWindow],
    ]) {
      if (original === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original;
      }
    }
  });

  it('rejects unauthenticated initiation before dispatch', async () => {
    await request(app).get('/api/mcp/one/oauth/initiate').expect(401);
  });

  it('limits authenticated initiations across MCP names but isolates users', async () => {
    await request(app)
      .get('/api/mcp/one/oauth/initiate')
      .set('x-test-user', 'user-a')
      .expect(204);
    await request(app)
      .get('/api/mcp/two/oauth/initiate')
      .set('x-test-user', 'user-a')
      .expect(204);
    const blocked = await request(app)
      .get('/api/mcp/three/oauth/initiate')
      .set('x-test-user', 'user-a')
      .expect(429);
    expect(blocked.headers['retry-after']).toMatch(/^\d+$/);
    expect(blocked.body).toEqual({ error: 'Too many MCP OAuth requests' });

    // Rate limiting another principal must not consume user-a's budget.
    await request(app)
      .get('/api/mcp/one/oauth/initiate')
      .set('x-test-user', 'user-b')
      .expect(204);
  });

  it('limits public callbacks by client IP across server names before dispatch', async () => {
    await request(app).get('/api/mcp/one/oauth/callback').expect(204);
    await request(app).get('/api/mcp/two/oauth/callback').expect(204);
    const blocked = await request(app).get('/api/mcp/three/oauth/callback').expect(429);
    expect(blocked.headers['retry-after']).toMatch(/^\d+$/);
    expect(blocked.body).toEqual({ error: 'Too many MCP OAuth requests' });
  });
});
