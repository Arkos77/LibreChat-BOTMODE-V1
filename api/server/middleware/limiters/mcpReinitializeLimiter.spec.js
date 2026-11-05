const express = require('express');
const request = require('supertest');

const mockLimiter = jest.fn((_req, _res, next) => next());
const mockRateLimit = jest.fn(() => mockLimiter);

jest.mock('express-rate-limit', () => mockRateLimit);
jest.mock('@librechat/api', () => ({
  limiterCache: jest.fn(() => ({})),
}));
jest.mock('@librechat/data-schemas', () => ({
  getTenantId: jest.fn(),
}));

describe('MCP reinitialize rate limiter', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.resetModules();
    const { getTenantId } = require('@librechat/data-schemas');
    getTenantId.mockReturnValue('tenant-A');
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  it('uses a shared Redis-backed per-user-and-tenant budget', () => {
    const limiter = require('./mcpReinitializeLimiter');
    const { limiterCache } = require('@librechat/api');
    const next = jest.fn();
    limiter({ user: { id: 'user-A' } }, {}, next);

    const options = mockRateLimit.mock.calls.at(-1)[0];
    expect(options).toMatchObject({
      limit: 10,
      windowMs: 60_000,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    });
    expect(limiterCache).toHaveBeenCalledWith('mcp_reinitialize_user_limiter');
    expect(options.keyGenerator({ user: { id: 'user-A' } })).toBe(
      JSON.stringify(['tenant-A', 'user-A']),
    );
    expect(options.keyGenerator({ user: { id: 'user-B' } })).not.toBe(
      options.keyGenerator({ user: { id: 'user-A' } }),
    );
    expect(options.keyGenerator({ user: { id: 'user-A', tenantId: 'tenant-B' } })).not.toBe(
      options.keyGenerator({ user: { id: 'user-A' } }),
    );
    expect(mockLimiter).toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('uses safe defaults for invalid configuration', () => {
    process.env.MCP_REINITIALIZE_USER_MAX = '-4';
    process.env.MCP_REINITIALIZE_USER_WINDOW = 'Infinity';
    const limiter = require('./mcpReinitializeLimiter');
    limiter({ user: { id: 'user-A' } }, {}, jest.fn());
    expect(mockRateLimit.mock.calls.at(-1)[0]).toMatchObject({
      limit: 10,
      windowMs: 60_000,
    });
  });

  it('respects a configured per-user limit', () => {
    process.env.MCP_REINITIALIZE_USER_MAX = '3';
    process.env.MCP_REINITIALIZE_USER_WINDOW = '5';
    const limiter = require('./mcpReinitializeLimiter');
    limiter({ user: { id: 'user-A' } }, {}, jest.fn());
    expect(mockRateLimit.mock.calls.at(-1)[0]).toMatchObject({
      limit: 3,
      windowMs: 300_000,
    });
  });

  it('responds 429 with Retry-After without invoking the expensive operation', async () => {
    const limiter = require('./mcpReinitializeLimiter');
    limiter({ user: { id: 'user-A' } }, {}, jest.fn());
    const options = mockRateLimit.mock.calls.at(-1)[0];

    const app = express();
    const expensiveOperation = jest.fn((_req, res) => res.status(200).end());
    app.use((req, _res, next) => {
      req.rateLimit = { resetTime: new Date(Date.now() + 30_000) };
      next();
    });
    app.post('/api/mcp/test-server/reinitialize', options.handler, expensiveOperation);

    const response = await request(app).post('/api/mcp/test-server/reinitialize');
    expect(response.status).toBe(429);
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    expect(response.body).toEqual({
      error: 'MCP server reinitialization rate limit exceeded',
    });
    expect(expensiveOperation).not.toHaveBeenCalled();
  });
});
