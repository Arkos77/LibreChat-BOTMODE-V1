'use strict';
const {
  bindNativeMissionOriginalChildBrokerForAcceptedMission: bind,
} = require('./nativeMissionOriginalChildBrokerHost');

describe('trusted native child transport installation', () => {
  const selectedTransport = async () => ({ ok: true });
  const host = { modelFetchFactory: jest.fn(() => selectedTransport) };
  const plan = { tasks: [{ agentId: 'worker' }, { agentId: 'analysis' }] };
  const attestation = { mode: 'receipts_required' };
  const client = () => ({
    options: {
      agent: { id: 'worker' },
      subagentTasks: { scopeId: 'original' },
    },
  });
  it('attaches only the trusted server host to a verified detached mission', () => {
    const run = client();
    expect(
      bind({
        client: run,
        brokerHost: host,
        originalPlan: plan,
        capabilityAttestation: attestation,
      }),
    ).toBe(true);
    const selected = { agentId: 'analysis', provider: 'OpenRouter', model: 'openrouter/free' };
    expect(run.options.nativeDetachedModelFetchFactory(selected)).toBe(selectedTransport);
    expect(host.modelFetchFactory).toHaveBeenCalledWith(selected);
  });
  it('builds an eager multiagent graph without letting unplanned specialists reach any provider', async () => {
    host.modelFetchFactory.mockClear();
    const run = client();
    expect(
      bind({
        client: run,
        brokerHost: host,
        originalPlan: plan,
        capabilityAttestation: attestation,
      }),
    ).toBe(true);
    const thirdChild = run.options.nativeDetachedModelFetchFactory({
      agentId: 'unplanned-rewriter',
      provider: 'OpenRouter',
      model: 'openrouter/free',
    });
    const parentSelfChild = run.options.nativeDetachedModelFetchFactory({
      agentId: 'worker',
      provider: 'OpenRouter',
      model: 'openrouter/free',
    });
    expect(typeof thirdChild).toBe('function');
    expect(typeof parentSelfChild).toBe('function');
    await expect(thirdChild('https://openrouter.ai/api/v1/chat/completions')).rejects.toThrow(
      'NATIVE_ORIGINAL_CHILD_UNPLANNED_PROVIDER_EFFECT_DENIED',
    );
    await expect(parentSelfChild('https://openrouter.ai/api/v1/chat/completions')).rejects.toThrow(
      'NATIVE_ORIGINAL_CHILD_UNPLANNED_PROVIDER_EFFECT_DENIED',
    );
    expect(host.modelFetchFactory).not.toHaveBeenCalled();
    const selected = run.options.nativeDetachedModelFetchFactory({
      agentId: 'analysis',
      provider: 'OpenRouter',
      model: 'openrouter/free',
    });
    expect(selected).toBe(selectedTransport);
    expect(host.modelFetchFactory).toHaveBeenCalledTimes(1);
  });
  it('leaves model-only missions and hostless deployments unchanged', () => {
    const run = client();
    expect(
      bind({
        client: run,
        brokerHost: host,
        originalPlan: plan,
        capabilityAttestation: { mode: 'model_only' },
      }),
    ).toBe(false);
    expect(bind({ client: run, originalPlan: plan, capabilityAttestation: attestation })).toBe(
      false,
    );
    expect(run.options.nativeDetachedModelFetchFactory).toBeUndefined();
  });
  it('refuses incomplete mission or host without provider fallback', () => {
    for (const override of [
      { brokerHost: {} },
      { client: { options: {} } },
      { originalPlan: { tasks: [{ agentId: 'worker' }] } },
      { capabilityAttestation: { mode: 'unknown' } },
    ]) {
      expect(() =>
        bind({
          client: client(),
          brokerHost: host,
          originalPlan: plan,
          capabilityAttestation: attestation,
          ...override,
        }),
      ).toThrow('NATIVE_ORIGINAL_CHILD_HOST_ADMISSION_DENIED');
    }
  });
});
