const { getTenantId } = require('@librechat/data-schemas');
const { MCPOAuthHandler } = require('@librechat/api');

/**
 * Public MCP OAuth status and token routes are always scoped to the
 * authenticated owner. System-scoped flows must be handled internally.
 */
function canAccessOAuthFlow(flowId, userId) {
  if (typeof userId !== 'string' || userId.length === 0 || userId === 'system') {
    return false;
  }

  const parsed = MCPOAuthHandler.parseFlowId(flowId);
  if (!parsed || parsed.userId !== userId || parsed.userId === 'system') {
    return false;
  }

  return !parsed.tenantId || parsed.tenantId === getTenantId();
}

module.exports = canAccessOAuthFlow;
