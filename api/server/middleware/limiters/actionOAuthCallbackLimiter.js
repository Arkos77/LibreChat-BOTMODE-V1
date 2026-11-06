const rateLimit = require('express-rate-limit');
const { limiterCache, removePorts } = require('@librechat/api');

let callbackLimiter;

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 10000 ? parsed : fallback;
}

/** Public OAuth redirects must be throttled before JWT parsing or provider exchange. */
function actionOAuthCallbackLimiter(req, res, next) {
  if (!callbackLimiter) {
    const minutes = positiveInteger(process.env.ACTION_OAUTH_CALLBACK_WINDOW, 5);
    callbackLimiter = rateLimit({
      windowMs: minutes * 60 * 1000,
      limit: positiveInteger(process.env.ACTION_OAUTH_CALLBACK_MAX, 120),
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      keyGenerator: removePorts,
      store: limiterCache('action_oauth_callback_ip_limiter'),
      handler: (request, response) => {
        const resetAt = request.rateLimit?.resetTime?.getTime?.();
        const retryAfter = Number.isFinite(resetAt)
          ? Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
          : minutes * 60;
        response.set('Retry-After', String(retryAfter));
        return response.status(429).json({ error: 'Too many Action OAuth requests' });
      },
    });
  }
  return callbackLimiter(req, res, next);
}

module.exports = actionOAuthCallbackLimiter;
