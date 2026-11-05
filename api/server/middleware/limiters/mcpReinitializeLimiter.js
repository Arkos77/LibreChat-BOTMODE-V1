const rateLimit = require('express-rate-limit');
const { limiterCache } = require('@librechat/api');
const { getTenantId } = require('@librechat/data-schemas');

let configuredMcpReinitializeLimiter;

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : fallback;
}

/**
 * Reinitializing an MCP connection can trigger external network calls and tool
 * discovery. Throttle it per authenticated user and tenant, not per server
 * name (otherwise users could bypass the limit by changing the URL).
 *
 * Use the shared limiter cache, so the budget applies across API replicas.
 */
function mcpReinitializeLimiter(req, res, next) {
  if (!configuredMcpReinitializeLimiter) {
    const max = positiveInteger(process.env.MCP_REINITIALIZE_USER_MAX, 10);
    const windowInMinutes = positiveInteger(process.env.MCP_REINITIALIZE_USER_WINDOW, 1);
    const windowMs = windowInMinutes * 60 * 1000;

    configuredMcpReinitializeLimiter = rateLimit({
      windowMs,
      limit: max,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      keyGenerator: (limitedReq) =>
        JSON.stringify([
          limitedReq.user?.tenantId ?? getTenantId() ?? null,
          String(limitedReq.user?.id ?? ''),
        ]),
      store: limiterCache('mcp_reinitialize_user_limiter'),
      handler: (limitedReq, limitedRes) => {
        const resetAt = limitedReq.rateLimit?.resetTime?.getTime?.();
        const retryAfter = Number.isFinite(resetAt)
          ? Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
          : windowInMinutes * 60;
        limitedRes.set('Retry-After', String(retryAfter));
        return limitedRes.status(429).json({
          error: 'MCP server reinitialization rate limit exceeded',
        });
      },
    });
  }
  return configuredMcpReinitializeLimiter(req, res, next);
}

module.exports = mcpReinitializeLimiter;
