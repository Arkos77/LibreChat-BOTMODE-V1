const rateLimit = require('express-rate-limit');
const { limiterCache, removePorts } = require('@librechat/api');
const { getTenantId } = require('@librechat/data-schemas');

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 10000 ? parsed : fallback;
}

// Keep initiation and callback budgets separate: callbacks are public browser
// redirects while initiation happens only after JWT authentication.
let initiationLimiter;
let callbackLimiter;

function sendLimitError(req, res, defaultWindowSeconds) {
  const resetAt = req.rateLimit?.resetTime?.getTime?.();
  const retryAfter = Number.isFinite(resetAt)
    ? Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
    : defaultWindowSeconds;
  res.set('Retry-After', String(retryAfter));
  return res.status(429).json({ error: 'Too many MCP OAuth requests' });
}

/** Create the per-user limiter once, outside the request path during route startup. */
function createInitiationLimiter() {
  if (!initiationLimiter) {
    const minutes = positiveInteger(process.env.MCP_OAUTH_INITIATE_WINDOW, 5);
    initiationLimiter = rateLimit({
      windowMs: minutes * 60 * 1000,
      limit: positiveInteger(process.env.MCP_OAUTH_INITIATE_MAX, 20),
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      keyGenerator: (request) =>
        JSON.stringify([
          request.user?.tenantId ?? getTenantId() ?? null,
          String(request.user?.id ?? ''),
        ]),
      store: limiterCache('mcp_oauth_initiate_user_limiter'),
      handler: (request, response) => sendLimitError(request, response, minutes * 60),
    });
  }
  return initiationLimiter;
}

/** Create the callback limiter once, outside the request path during route startup. */
function createCallbackLimiter() {
  if (!callbackLimiter) {
    const minutes = positiveInteger(process.env.MCP_OAUTH_CALLBACK_WINDOW, 5);
    callbackLimiter = rateLimit({
      windowMs: minutes * 60 * 1000,
      limit: positiveInteger(process.env.MCP_OAUTH_CALLBACK_MAX, 120),
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      keyGenerator: removePorts,
      store: limiterCache('mcp_oauth_callback_ip_limiter'),
      handler: (request, response) => sendLimitError(request, response, minutes * 60),
    });
  }
  return callbackLimiter;
}

/** Called during route initialization, before the first incoming request. */
function initializeMcpOAuthLimiters() {
  createInitiationLimiter();
  createCallbackLimiter();
}

/** Throttle network/IdP work across all MCP servers for one authenticated user. */
function mcpOAuthInitiateLimiter(req, res, next) {
  if (!req.user?.id) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  return createInitiationLimiter()(req, res, next);
}

/** Throttle unauthenticated callbacks by client IP, before state processing. */
function mcpOAuthCallbackLimiter(req, res, next) {
  return createCallbackLimiter()(req, res, next);
}

module.exports = {
  initializeMcpOAuthLimiters,
  mcpOAuthInitiateLimiter,
  mcpOAuthCallbackLimiter,
};
