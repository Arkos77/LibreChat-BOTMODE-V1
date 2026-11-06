const fs = require('node:fs');
const path = require('node:path');

const mockParseFlowId = jest.fn();
const mockGetTenantId = jest.fn();

jest.mock('@librechat/api', () => ({
  MCPOAuthHandler: { parseFlowId: (...args) => mockParseFlowId(...args) },
}));
jest.mock('@librechat/data-schemas', () => ({
  getTenantId: (...args) => mockGetTenantId(...args),
}));

const canAccessOAuthFlow = require('./mcpOAuthFlowAccess');

describe('public MCP OAuth flow ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetTenantId.mockReturnValue('tenant-a');
  });

  it('allows a matching authenticated user within the current tenant', () => {
    mockParseFlowId.mockReturnValue({
      userId: 'user-a',
      tenantId: 'tenant-a',
      serverName: 'example',
    });
    expect(canAccessOAuthFlow('flow-id', 'user-a')).toBe(true);
  });

  it('refuses a different user even for a completed flow', () => {
    mockParseFlowId.mockReturnValue({
      userId: 'user-b',
      tenantId: 'tenant-a',
      serverName: 'example',
    });
    expect(canAccessOAuthFlow('flow-id', 'user-a')).toBe(false);
  });

  it('never exposes system-scoped flows to an ordinary user', () => {
    mockParseFlowId.mockReturnValue({
      userId: 'system',
      tenantId: 'tenant-a',
      serverName: 'example',
    });
    expect(canAccessOAuthFlow('flow-id', 'user-a')).toBe(false);
    expect(canAccessOAuthFlow('flow-id', 'system')).toBe(false);
  });

  it('rejects cross-tenant access to another tenant flow', () => {
    mockParseFlowId.mockReturnValue({
      userId: 'user-a',
      tenantId: 'tenant-b',
      serverName: 'example',
    });
    expect(canAccessOAuthFlow('flow-id', 'user-a')).toBe(false);
  });

  it('rejects malformed flows and missing authenticated identities', () => {
    mockParseFlowId.mockReturnValue(null);
    expect(canAccessOAuthFlow('invalid', 'user-a')).toBe(false);
    expect(canAccessOAuthFlow('invalid', undefined)).toBe(false);
  });

  it('protects both OAuth token reads and status reads with the same guard', () => {
    const source = fs.readFileSync(path.resolve(__dirname, './mcp.js'), 'utf8');
    const gate = 'if (!canAccessOAuthFlow(flowId, user.id))';
    expect(source.split(gate)).toHaveLength(3);
    expect(source).toContain("const canAccessOAuthFlow = require('./mcpOAuthFlowAccess')");
  });
});
