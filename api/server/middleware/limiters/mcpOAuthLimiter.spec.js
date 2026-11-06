const fs = require('node:fs');
const path = require('node:path');

jest.mock('express-rate-limit', () =>
  jest.fn((options) => jest.fn((req, res, next) => next())),
);
jest.mock('@librechat/api', () => ({
  limiterCache: jest.fn((name) => ({ scope: name })),
  removePorts: jest.fn((req) => req.ip),
}));
jest.mock('@librechat/data-schemas', () => ({
  getTenantId: jest.fn(() => 'default-tenant'),
}));

function mockResponse() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
  };
  return res;
}

describe('MCP OAuth preflight rate limits', () => {
  let rateLimit;
  let limiterCache;
  let removePorts;
  let mcpOAuthInitiateLimiter;
  let mcpOAuthCallbackLimiter;

  beforeEach(() => {
    jest.resetModules();
    delete process.env.MCP_OAUTH_INITIATE_MAX;
    delete process.env.MCP_OAUTH_INITIATE_WINDOW;
    delete process.env.MCP_OAUTH_CALLBACK_MAX;
    delete process.env.MCP_OAUTH_CALLBACK_WINDOW;
    rateLimit = require('express-rate-limit');
    ({ limiterCache, removePorts } = require('@librechat/api'));
    ({ mcpOAuthInitiateLimiter, mcpOAuthCallbackLimiter } = require('./mcpOAuthLimiter'));
  });

  afterEach(() => {
    delete process.env.MCP_OAUTH_INITIATE_MAX;
    delete process.env.MCP_OAUTH_INITIATE_WINDOW;
    delete process.env.MCP_OAUTH_CALLBACK_MAX;
    delete process.env.MCP_OAUTH_CALLBACK_WINDOW;
  });

  it('rejects an unauthenticated OAuth initiation before creating a limiter or flow', () => {
    const res = mockResponse();
    const next = jest.fn();

    mcpOAuthInitiateLimiter({}, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(rateLimit).not.toHaveBeenCalled();
    expect(limiterCache).not.toHaveBeenCalled();
  });

  it('shares an initiation budget across MCP servers, scoped to tenant and user', () => {
    const res = mockResponse();
    const next = jest.fn();
    mcpOAuthInitiateLimiter({ user: { id: 'user-a', tenantId: 'tenant-a' } }, res, next);
    const options = rateLimit.mock.calls[0][0];
    expect(options.limit).toBe(20);
    expect(options.windowMs).toBe(5 * 60 * 1000);
    expect(options.keyGenerator({ user: { id: 'user-a', tenantId: 'tenant-a' }, params: { serverName: 'one' } }))
      .toBe(options.keyGenerator({ user: { id: 'user-a', tenantId: 'tenant-a' }, params: { serverName: 'two' } }));
    expect(options.keyGenerator({ user: { id: 'user-b', tenantId: 'tenant-a' } }))
      .not.toBe(options.keyGenerator({ user: { id: 'user-a', tenantId: 'tenant-a' } }));
    expect(options.keyGenerator({ user: { id: 'user-a', tenantId: 'tenant-b' } }))
      .not.toBe(options.keyGenerator({ user: { id: 'user-a', tenantId: 'tenant-a' } }));
    expect(limiterCache).toHaveBeenCalledWith('mcp_oauth_initiate_user_limiter');
    expect(options.standardHeaders).toBe('draft-7');
    expect(options.legacyHeaders).toBe(false);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('limits callback traffic by IP independently from initiation and from URL server name', () => {
    const res = mockResponse();
    const next = jest.fn();
    mcpOAuthCallbackLimiter({ ip: '192.0.2.3', params: { serverName: 'one' } }, res, next);

    const options = rateLimit.mock.calls[0][0];
    expect(options.limit).toBe(120);
    expect(options.windowMs).toBe(5 * 60 * 1000);
    expect(options.keyGenerator).toBe(removePorts);
    expect(options.keyGenerator({ ip: '192.0.2.3', params: { serverName: 'one' } }))
      .toBe(options.keyGenerator({ ip: '192.0.2.3', params: { serverName: 'two' } }));
    expect(limiterCache).toHaveBeenCalledWith('mcp_oauth_callback_ip_limiter');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('responds 429 with a Retry-After header without returning credentials', () => {
    const res = mockResponse();
    mcpOAuthCallbackLimiter({ ip: '192.0.2.4' }, res, jest.fn());
    const options = rateLimit.mock.calls[0][0];
    options.handler({ rateLimit: { resetTime: new Date(Date.now() + 3000) } }, res);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.set).toHaveBeenCalledWith('Retry-After', expect.any(String));
    expect(res.json).toHaveBeenCalledWith({ error: 'Too many MCP OAuth requests' });
  });

  it('falls back to safe quotas for invalid environment settings', () => {
    process.env.MCP_OAUTH_INITIATE_MAX = '0';
    process.env.MCP_OAUTH_CALLBACK_MAX = 'NaN';
    mcpOAuthInitiateLimiter({ user: { id: 'user-a' } }, mockResponse(), jest.fn());
    mcpOAuthCallbackLimiter({ ip: '192.0.2.5' }, mockResponse(), jest.fn());
    expect(rateLimit.mock.calls[0][0].limit).toBe(20);
    expect(rateLimit.mock.calls[1][0].limit).toBe(120);
  });

  it('installs both gates before flow work, without restricting the OAuth callback to JWT', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../routes/mcp.js'), 'utf8');
    expect(source).toContain(
      "'/:serverName/oauth/initiate', requireJwtAuth, mcpOAuthInitiateLimiter, setOAuthSession",
    );
    expect(source).toContain(
      "'/:serverName/oauth/callback', mcpOAuthCallbackLimiter, async",
    );
    expect(source).not.toContain(
      "'/:serverName/oauth/callback', requireJwtAuth",
    );
  });
});
