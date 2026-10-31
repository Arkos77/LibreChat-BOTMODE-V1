import {
  attachNativeGraphBrokerModelFetch,
  type NativeGraphModelFetchBinding,
} from './nativeGraphModelFetchBinding';

const binding: NativeGraphModelFetchBinding = {
  agentId: 'saved-analysis',
  nodeId: 'mission/analysis',
  taskId: 'mission/analysis-task',
  provider: 'openrouter',
  model: 'ci-free',
};

describe('direct native graph host broker binding', () => {
  it('never changes ordinary models when no trusted host is supplied', () => {
    const options = { model: 'ci-free', configuration: { defaultHeaders: { test: 'yes' } } };
    expect(attachNativeGraphBrokerModelFetch({
      clientOptions: options, binding, factory: undefined,
    })).toBe(options);
  });

  it('attaches scoped transport only to the compiled node without mutating the saved model', () => {
    const original = { model: 'ci-free', configuration: { defaultHeaders: { test: 'yes' } } };
    const host = jest.fn((_binding: NativeGraphModelFetchBinding) => fetch);
    const result = attachNativeGraphBrokerModelFetch({
      clientOptions: original, binding, factory: host,
    });
    expect(result).not.toBe(original);
    expect(original.configuration).not.toHaveProperty('fetch');
    expect(result?.configuration?.fetch).toBe(fetch);
    expect(result?.configuration?.defaultHeaders).toEqual({ test: 'yes' });
    expect(host).toHaveBeenCalledWith(binding);
    expect(Object.isFrozen(host.mock.calls[0][0])).toBe(true);
  });

  it('refuses a host opting into unsupported model or transport', () => {
    const host = jest.fn(() => fetch);
    for (const current of [
      { binding: { ...binding, provider: 'unknown' }, clientOptions: { model: 'ci-free' } },
      { binding, clientOptions: { model: 'substituted' } },
      { binding, clientOptions: { model: 'ci-free', useResponsesApi: true } },
      { binding: { ...binding, nodeId: '' }, clientOptions: { model: 'ci-free' } },
    ]) {
      expect(() => attachNativeGraphBrokerModelFetch({
        ...current, factory: host,
      })).toThrow('NATIVE_GRAPH_BROKER_MODEL_BINDING_UNAUTHORIZED');
    }
    expect(host).not.toHaveBeenCalled();
  });

  it('refuses fallback, transport replacement and incomplete host grant', () => {
    for (const clientOptions of [
      { model: 'ci-free', fallbacks: [{ provider: 'fallback' }] },
      { model: 'ci-free', configuration: { fetch } },
    ]) {
      expect(() => attachNativeGraphBrokerModelFetch({
        clientOptions, binding, factory: () => fetch,
      })).toThrow('NATIVE_GRAPH_BROKER_MODEL_TRANSPORT_CONFLICT');
    }
    expect(() => attachNativeGraphBrokerModelFetch({
      clientOptions: { model: 'ci-free' }, binding, factory: () => undefined,
    })).toThrow('NATIVE_GRAPH_BROKER_TRANSPORT_UNAVAILABLE');
  });
});
