import type { PluginAuthMethods } from '@librechat/data-schemas';
import { getPluginAuthMap } from './auth';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  decrypt: jest.fn(async (value: string) => value),
}));

function mockAuthLookup(records: Array<{ pluginKey: string; authField: string; value: string }>) {
  return jest
    .fn()
    .mockResolvedValue(records) as unknown as PluginAuthMethods['findPluginAuthsByKeys'];
}

describe('getPluginAuthMap unsafe key regression', () => {
  it('preserves a plugin key named __proto__ as an own property', async () => {
    const result = await getPluginAuthMap({
      userId: 'test-user',
      pluginKeys: ['__proto__'],
      findPluginAuthsByKeys: mockAuthLookup([
        { pluginKey: '__proto__', authField: 'API_KEY', value: 'test-only-token' },
      ]),
    });

    expect(Object.getPrototypeOf(result)).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(true);
    expect(result['__proto__']).toEqual({ API_KEY: 'test-only-token' });
  });

  it('preserves an auth field named __proto__ without altering the nested prototype', async () => {
    const result = await getPluginAuthMap({
      userId: 'test-user',
      pluginKeys: ['mcp_local'],
      findPluginAuthsByKeys: mockAuthLookup([
        { pluginKey: 'mcp_local', authField: '__proto__', value: 'test-only-value' },
      ]),
    });

    expect(Object.getPrototypeOf(result.mcp_local)).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(result.mcp_local, '__proto__')).toBe(true);
    expect(result.mcp_local['__proto__']).toBe('test-only-value');
  });

  it('retains ordinary MCP plugin authentication fields', async () => {
    const result = await getPluginAuthMap({
      userId: 'test-user',
      pluginKeys: ['mcp_local'],
      findPluginAuthsByKeys: mockAuthLookup([
        { pluginKey: 'mcp_local', authField: 'API_KEY', value: 'test-only-token' },
      ]),
    });
    expect(result.mcp_local.API_KEY).toBe('test-only-token');
  });

  it('returns a safe key map when the lookup fails and throwError is false', async () => {
    const failedLookup = jest
      .fn()
      .mockRejectedValue(
        new Error('test lookup failure'),
      ) as unknown as PluginAuthMethods['findPluginAuthsByKeys'];

    const result = await getPluginAuthMap({
      userId: 'test-user',
      pluginKeys: ['__proto__'],
      throwError: false,
      findPluginAuthsByKeys: failedLookup,
    });

    expect(Object.getPrototypeOf(result)).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(result['__proto__'])).toBeNull();
  });
});
