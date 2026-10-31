'use strict';
const {
  bindNativeMissionOriginalChildBrokerForAcceptedMission: bind,
} = require('./nativeMissionOriginalChildBrokerHost');

describe('trusted native child transport installation', () => {
  const host = { modelFetchFactory: () => undefined };
  const plan = { tasks: [{ agentId: 'worker' }, { agentId: 'analysis' }] };
  const attestation = { mode: 'receipts_required' };
  const client = () => ({ options: { subagentTasks: { scopeId: 'original' } } });
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
    expect(run.options.nativeDetachedModelFetchFactory).toBe(host.modelFetchFactory);
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
