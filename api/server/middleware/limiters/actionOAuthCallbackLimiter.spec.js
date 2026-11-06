const fs = require('node:fs');
const path = require('node:path');

jest.mock('express-rate-limit', () => jest.fn(() => (_req, _res, next) => next()));
jest.mock('@librechat/api', () => ({
  limiterCache: jest.fn((name) => ({ scope: name })),
  removePorts: jest.fn((req) => req.ip),
}));

const mockResponse = () => ({
  set: jest.fn().mockReturnThis(),
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});

describe('Action OAuth callback rate limit', () => {
  let rateLimit;
  let limiterCache;
  let removePorts;
  let actionOAuthCallbackLimiter;

  beforeEach(() => {
    jest.resetModules();
    delete process.env.ACTION_OAUTH_CALLBACK_WINDOW;
    delete process.env.ACTION_OAUTH_CALLBACK_MAX;
    rateLimit = require('express-rate-limit');
    ({ limiterCache, removePorts } = require('@librechat/api'));
    actionOAuthCallbackLimiter = require('./actionOAuthCallbackLimiter');
  });

  afterEach(() => {
    delete process.env.ACTION_OAUTH_CALLBACK_WINDOW;
    delete process.env.ACTION_OAUTH_CALLBACK_MAX;
  });

  it('limits public OAuth callbacks per IP regardless of Action ID', () => {
    const next = jest.fn();
    actionOAuthCallbackLimiter({ ip: '192.0.2.1' }, mockResponse(), next);

    const options = rateLimit.mock.calls[0][0];
    expect(options.limit).toBe(120);
    expect(options.windowMs).toBe(5 * 60 * 1000);
    expect(options.standardHeaders).toBe('draft-7');
    expect(options.legacyHeaders).toBe(false);
    expect(options.keyGenerator).toBe(removePorts);
    expect(options.keyGenerator({ ip: '192.0.2.1', params: { action_id: 'one' } })).toBe(
      options.keyGenerator({ ip: '192.0.2.1', params: { action_id: 'two' } }),
    );
    expect(options.keyGenerator({ ip: '192.0.2.1' })).not.toBe(
      options.keyGenerator({ ip: '192.0.2.2' }),
    );
    expect(limiterCache).toHaveBeenCalledWith('action_oauth_callback_ip_limiter');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns HTTP 429 with Retry-After and does not reveal OAuth parameters', () => {
    const res = mockResponse();
    actionOAuthCallbackLimiter({ ip: '192.0.2.1' }, res, jest.fn());
    const options = rateLimit.mock.calls[0][0];
    options.handler({ rateLimit: { resetTime: new Date(Date.now() + 30000) } }, res);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(Number(res.set.mock.calls[0][1])).toBeGreaterThan(0);
    expect(res.set).toHaveBeenCalledWith('Retry-After', expect.any(String));
    expect(res.json).toHaveBeenCalledWith({ error: 'Too many Action OAuth requests' });
  });

  it('uses safe bounds for invalid environment configuration', () => {
    process.env.ACTION_OAUTH_CALLBACK_WINDOW = '0';
    process.env.ACTION_OAUTH_CALLBACK_MAX = 'NaN';
    actionOAuthCallbackLimiter({ ip: '192.0.2.3' }, mockResponse(), jest.fn());
    expect(rateLimit.mock.calls[0][0]).toMatchObject({
      limit: 120,
      windowMs: 5 * 60 * 1000,
    });
  });

  it('accepts configured quotas without sharing the MCP callback budget', () => {
    process.env.ACTION_OAUTH_CALLBACK_WINDOW = '3';
    process.env.ACTION_OAUTH_CALLBACK_MAX = '50';
    actionOAuthCallbackLimiter({ ip: '192.0.2.3' }, mockResponse(), jest.fn());
    expect(rateLimit.mock.calls[0][0]).toMatchObject({
      limit: 50,
      windowMs: 3 * 60 * 1000,
    });
    expect(limiterCache).not.toHaveBeenCalledWith('mcp_oauth_callback_ip_limiter');
  });

  it('places the rate limit before callback JWT validation and keeps the callback public', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../routes/actions.js'), 'utf8');
    expect(source).toContain(
      "const actionOAuthCallbackLimiter = require('../middleware/limiters/actionOAuthCallbackLimiter');",
    );
    expect(source).toContain(
      "router.get('/:action_id/oauth/callback', actionOAuthCallbackLimiter, async",
    );
    expect(source).not.toContain(
      "router.get('/:action_id/oauth/callback', requireJwtAuth",
    );
  });
});
