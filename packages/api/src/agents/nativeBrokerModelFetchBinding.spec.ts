import {
  attachNativeDetachedBrokerModelFetch,
  type NativeDetachedModelFetchBinding,
} from './nativeBrokerModelFetchBinding';

const binding: NativeDetachedModelFetchBinding = {
  agentId: 'ci-specialist-agent',
  provider: 'openrouter',
  model: 'openrouter/free',
};

describe('native child model transport binding (opt-in; no live dispatch)', () => {
  it('leaves existing model config unchanged without a host-approved factory', () => {
    const options = { configuration: { defaultHeaders: { 'X-CI': 'test' } } };
    const previous = options.configuration;
    attachNativeDetachedBrokerModelFetch({
      clientOptions: options,
      binding,
      modelFetchFactory: undefined,
      originalMissionHasDelegation: true,
    });
    expect(options.configuration).toBe(previous);
  });

  it('installs one scoped fetch while preserving the original headers', () => {
    const options: { configuration: Record<string, unknown> } = {
      configuration: { defaultHeaders: { 'X-CI': 'test' } },
    };
    const transport: typeof fetch = fetch;
    const factory = jest.fn((_binding: NativeDetachedModelFetchBinding) => transport);
    attachNativeDetachedBrokerModelFetch({
      clientOptions: options,
      binding,
      modelFetchFactory: factory,
      originalMissionHasDelegation: true,
    });
    expect(options.configuration.fetch).toBe(transport);
    expect(options.configuration.defaultHeaders).toEqual({ 'X-CI': 'test' });
    expect(factory).toHaveBeenCalledWith(binding);
    expect(Object.isFrozen(factory.mock.calls[0][0])).toBe(true);
  });

  it('passes the persisted custom OpenRouter identity to the trusted host without normalizing it to openAI', () => {
    const persisted = { ...binding, provider: 'OpenRouter' };
    const options: { configuration?: { fetch?: typeof fetch } } = {};
    const factory = jest.fn((_binding: NativeDetachedModelFetchBinding) => fetch);
    attachNativeDetachedBrokerModelFetch({
      clientOptions: options,
      binding: persisted,
      modelFetchFactory: factory,
      originalMissionHasDelegation: true,
    });
    expect(factory).toHaveBeenCalledWith(persisted);
    expect(options.configuration?.fetch).toBe(fetch);
    expect(() => attachNativeDetachedBrokerModelFetch({
      clientOptions: {},
      binding: { ...persisted, provider: 'OpenRouterCompatUnknown' },
      modelFetchFactory: factory,
      originalMissionHasDelegation: true,
    })).toThrow('NATIVE_BROKER_MODEL_BINDING_UNAUTHORIZED');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('refuses invalid model binding and non-mission callbacks before factory invocation', () => {
    const factory = jest.fn((_binding: NativeDetachedModelFetchBinding) => fetch);
    for (const item of [
      { binding: { ...binding, model: '' }, originalMissionHasDelegation: true },
      { binding: { ...binding, provider: 'anthropic' }, originalMissionHasDelegation: true },
      { binding, originalMissionHasDelegation: false },
    ]) {
      expect(() =>
        attachNativeDetachedBrokerModelFetch({
          clientOptions: {},
          modelFetchFactory: factory,
          ...item,
        }),
      ).toThrow('NATIVE_BROKER_MODEL_BINDING_UNAUTHORIZED');
    }
    expect(factory).not.toHaveBeenCalled();
  });

  it('refuses fallback and existing transport overrides', () => {
    const factory = jest.fn((_binding: NativeDetachedModelFetchBinding) => fetch);
    for (const clientOptions of [
      { fallbacks: [{ provider: 'other-provider' }] },
      { configuration: { fetch: jest.fn() } },
    ]) {
      expect(() =>
        attachNativeDetachedBrokerModelFetch({
          clientOptions,
          binding,
          modelFetchFactory: factory,
          originalMissionHasDelegation: true,
        }),
      ).toThrow('NATIVE_BROKER_MODEL_TRANSPORT_CONFLICT');
    }
  });

  it('does not install anything when a host intentionally refuses this binding', () => {
    const options: { configuration?: unknown } = {};
    attachNativeDetachedBrokerModelFetch({
      clientOptions: options,
      binding,
      modelFetchFactory: () => undefined,
      originalMissionHasDelegation: true,
    });
    expect(options.configuration).toBeUndefined();
  });
});
