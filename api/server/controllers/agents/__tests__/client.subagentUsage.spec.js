const mockGetMultiplier = jest.fn(() => 1);
const mockGetCacheMultiplier = jest.fn(() => 1);

jest.mock('~/models', () => ({
  getMultiplier: (...args) => mockGetMultiplier(...args),
  getCacheMultiplier: (...args) => mockGetCacheMultiplier(...args),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: { debug: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const AgentClient = require('../client');

describe('AgentClient#buildSubagentUsageEmitter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses a lifecycle-safe snapshot after the parent client is disposed', async () => {
    const write = jest.fn();
    const usageEmitSink = [];
    const pendingSubagentEmits = [];
    const endpointTokenConfig = { input: 2, output: 3 };
    const self = {
      options: {
        res: { write },
        req: { user: { id: 'user-1' } },
        endpointTokenConfig,
        endpointTokenConfigByAgentId: new Map([['child-agent', endpointTokenConfig]]),
      },
      responseMessageId: 'response-1',
      jobCreatedAt: 1234,
      usageEmitSink,
      pendingSubagentEmits,
      subagentUsageSeq: 4,
    };
    const emit = AgentClient.prototype.buildSubagentUsageEmitter.call(self, {
      interfaceConfig: { contextCost: true },
    });

    /** Mirror the fields cleared by disposeClient before the detached child
     * finishes; the callback must not read any of them. */
    self.options = null;
    self.responseMessageId = null;
    self.jobCreatedAt = null;
    self.usageEmitSink = null;
    self.pendingSubagentEmits = null;

    const usage = {
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
      model: 'child-model',
      provider: 'custom',
      agentId: 'child-agent',
    };
    await emit(usage);

    expect(usageEmitSink).toEqual([
      expect.objectContaining({
        runId: 'response-1:1234',
        seq: 5,
        usage_type: 'subagent',
        cost: expect.any(Number),
      }),
    ]);
    expect(usage.cost).toBe(usageEmitSink[0].cost);
    expect(write).toHaveBeenCalledTimes(1);
    expect(pendingSubagentEmits).toHaveLength(1);
    await expect(pendingSubagentEmits[0]).resolves.toBeUndefined();
  });
});

describe('AgentClient MTO subagent usage observation', () => {
  it('emits a sanitized MTO observation with the durable trace and an independent event id', async () => {
    const mtoEvents = [];
    const self = {
      options: {
        mtoTraceId: 'mto-trace-usage-123',
        mtoEventSink: (event) => mtoEvents.push(event),
      },
    };
    const observe = AgentClient.prototype.buildMtoSubagentUsageObserver.call(self);
    const usageEvent = {
      usage: { input_tokens: 7, output_tokens: 3, total_tokens: 10 },
      model: 'child-model',
      provider: 'custom',
      subagentType: 'researcher',
      subagentKind: 'agent',
      depth: 1,
      runId: 'root-run',
      parentRunId: 'parent-run',
      subagentRunId: 'child-run',
      subagentAgentId: 'child-agent',
      memberAgentId: 'member-agent',
    };

    observe(usageEvent);
    await Promise.resolve();

    expect(mtoEvents).toHaveLength(1);
    expect(mtoEvents[0]).toMatchObject({
      type: 'OBSERVED',
      source: 'subagent-usage',
      identity: {
        traceId: 'mto-trace-usage-123',
        rootRunId: 'root-run',
        runId: 'root-run',
        parentRunId: 'parent-run',
        subagentRunId: 'child-run',
        agentId: 'child-agent',
        memberAgentId: 'member-agent',
      },
      payload: {
        model: 'child-model',
        provider: 'custom',
        subagentType: 'researcher',
        subagentKind: 'agent',
        depth: 1,
        usage: { input_tokens: 7, output_tokens: 3, total_tokens: 10 },
      },
    });
    expect(mtoEvents[0].identity.traceEventId).toEqual(expect.any(String));
    expect(mtoEvents[0].identity.traceEventId).not.toBe('mto-trace-usage-123');
  });

  it('contains synchronous and asynchronous MTO sink failures', async () => {
    const syncSelf = {
      options: {
        mtoTraceId: 'mto-trace-sync',
        mtoEventSink: () => {
          throw new Error('sync sink failure');
        },
      },
    };
    const asyncSelf = {
      options: {
        mtoTraceId: 'mto-trace-async',
        mtoEventSink: () => Promise.reject(new Error('async sink failure')),
      },
    };

    const syncObserve = AgentClient.prototype.buildMtoSubagentUsageObserver.call(syncSelf);
    const asyncObserve = AgentClient.prototype.buildMtoSubagentUsageObserver.call(asyncSelf);
    const usageEvent = {
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      subagentType: 'researcher',
      runId: 'root-run',
      subagentRunId: 'child-run',
    };

    expect(() => syncObserve(usageEvent)).not.toThrow();
    expect(() => asyncObserve(usageEvent)).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });
});
