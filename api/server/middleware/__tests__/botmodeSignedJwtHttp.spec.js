/** Real passport-jwt verification over HTTP, with a simulated user database.
 * This proves the signed-token gate, not the full onboarding controller. */
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const passport = require('passport');

jest.mock('@librechat/data-schemas', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  runAsSystem: (callback) => callback(),
}));
jest.mock('~/models', () => ({
  getUserById: jest.fn(async (id) =>
    id === 'test-owner'
      ? {
          _id: { toString: () => 'test-owner' },
          role: 'USER',
        }
      : null,
  ),
  updateUser: jest.fn(),
}));
jest.mock('@librechat/api', () => ({
  AGENT_TRIGGER_SCOPE: 'agent_trigger',
  isEnabled: () => false,
  tenantContextMiddleware: (_req, _res, next) => next(),
  maybeRefreshCloudFrontAuthCookiesMiddleware: (_req, _res, next) => next(),
  getValidOpenIdReuseUserId: () => null,
  getAuthFailureReasonCategory: () => 'authentication_error',
  buildSafeAuthLogContext: () => ({}),
  recordRumProxyRequest: jest.fn(),
}));

const jwtLogin = require('~/strategies/jwtStrategy');
const requireJwtAuth = require('../requireJwtAuth');
const SECRET = 'test-only-signed-jwt-secret-never-use-in-production';

describe('BOT MODE signed JWT authentication over HTTP', () => {
  let app;
  const originalSecret = process.env.JWT_SECRET;
  beforeAll(() => {
    process.env.JWT_SECRET = SECRET;
    passport.use('jwt', jwtLogin());
    app = express();
    app.use('/api/agents', requireJwtAuth);
    // Only the downstream authenticated identity is inspected here.
    app.post('/api/agents/botmode/setup', (req, res) => res.json({ owner: req.user.id }));
    app.get('/api/agents/botmode/setup-status', (req, res) => res.json({ owner: req.user.id }));
  });
  afterAll(() => {
    passport.unuse('jwt');
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  test('rejects missing and invalid signatures before onboarding', async () => {
    const noToken = await request(app).post('/api/agents/botmode/setup');
    expect(noToken.status).toBe(401);
    const badToken = jwt.sign({ id: 'test-owner' }, 'incorrect-secret');
    const forged = await request(app)
      .post('/api/agents/botmode/setup')
      .set('Authorization', `Bearer ${badToken}`);
    expect(forged.status).toBe(401);
  });

  test('accepts correctly signed owner token for both onboarding routes', async () => {
    const token = jwt.sign({ id: 'test-owner' }, SECRET, { expiresIn: '5m' });
    const setup = await request(app)
      .post('/api/agents/botmode/setup')
      .set('Authorization', `Bearer ${token}`);
    expect(setup.status).toBe(200);
    expect(setup.body.owner).toBe('test-owner');
    const status = await request(app)
      .get('/api/agents/botmode/setup-status')
      .set('Authorization', `Bearer ${token}`);
    expect(status.status).toBe(200);
    expect(status.body.owner).toBe('test-owner');
  });

  test('rejects a signed token for a nonexistent account and scoped trigger token', async () => {
    const missing = jwt.sign({ id: 'unknown' }, SECRET);
    expect(
      (
        await request(app)
          .post('/api/agents/botmode/setup')
          .set('Authorization', `Bearer ${missing}`)
      ).status,
    ).toBe(401);
    const scoped = jwt.sign({ id: 'test-owner', scope: 'agent_trigger' }, SECRET);
    expect(
      (
        await request(app)
          .post('/api/agents/botmode/setup')
          .set('Authorization', `Bearer ${scoped}`)
      ).status,
    ).toBe(401);
  });
});