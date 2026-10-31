'use strict';
const {
  createNativeMissionOriginalChildBrokerBootstrap: create,
  matchesPersistedNativeBrokerAgentBinding,
} = require('./nativeMissionOriginalChildBrokerBootstrap');
const binding = {
  agentId: 'specialist',
  provider: 'openrouter',
  model: 'ci-free',
  endpoint: 'https://openrouter.ai/api/v1/chat/completions',
};
const base = () => ({
  enabled: true,
  bindingCatalog: [binding],
  brokerUrl: 'http://127.0.0.1:8095/',
  secret: 'long-local-test-secret-for-native-broker',
  collection: {
    createIndex: async () => {},
    insertOne: async () => {},
    findOne: async () => null,
    find: () => ({ limit: () => ({ toArray: async () => [] }) }),
  },
  getUserById: async () => null,
  isSubagentOwnerAdmissible: async () => false,
  getConvo: async () => null,
  getAgent: async () => null,
  getMessage: async () => null,
  listActiveSubagentThreadLeases: async () => [],
  getCheckpointer: async () => null,
  getExecutionScope: () => undefined,
  getOriginalCheckpointReference: () => undefined,
  checkPermission: async () => false,
});
describe('original child broker server bootstrap', () => {
  it('admits the exact persisted LibreChat model_parameters binding, never a stale top-level model', () => {
    const stored = {
      provider: 'OpenRouter',
      model: 'stale-older-model',
      model_parameters: { model: 'openrouter/free' },
    };
    expect(matchesPersistedNativeBrokerAgentBinding({
      agent: stored, provider: 'openrouter', model: 'openrouter/free',
    })).toBe(true);
    for (const request of [
      { provider: 'OpenROUTER', model: 'openrouter/free' },
      { provider: 'openrouter', model: 'stale-older-model' },
      { provider: 'openrouter', model: 'other-provider/free' },
    ]) {
      expect(matchesPersistedNativeBrokerAgentBinding({ agent: stored, ...request }))
        .toBe(false);
    }
    expect(matchesPersistedNativeBrokerAgentBinding({
      agent: { provider: 'OpenRouter', model_parameters: { model: 'another/free' } },
      provider: 'openrouter', model: 'openrouter/free',
    })).toBe(false);
  });
  it('remains disabled by default', () => expect(create({ enabled: false })).toBeUndefined());
  it('installs only the configured server-owned model binding', () => {
    const host = create(base());
    expect(typeof host.modelFetchFactory(binding)).toBe('function');
    expect(typeof host.modelFetchFactory({ ...binding, provider: 'OpenRouter' })).toBe('function');
    expect(() => host.modelFetchFactory({ ...binding, agentId: 'other' })).toThrow(
      'NATIVE_BROKER_HOST_MODEL_UNAUTHORIZED',
    );
  });
  it('fails closed on missing authority, invalid endpoint or duplicate model', () => {
    for (const patch of [
      { getConvo: null },
      { secret: 'short' },
      { brokerUrl: 'https://example.invalid/' },
      { bindingCatalog: [binding, binding] },
      { bindingCatalog: [{ ...binding, endpoint: 'https://openrouter.ai/v1/chat/completions' }] },
    ])
      expect(() => create({ ...base(), ...patch })).toThrow();
  });
});
