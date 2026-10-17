const {
  createNativeMissionColdGraphBuilder,
} = require('~/server/services/Endpoints/agents/nativeMissionColdGraphBuilder');
jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  createCachedTokenCounter: jest.fn(async () => () => 0),
}));
const AgentClient = require('./client');

describe('AgentClient authenticated cold mission run reconstruction', () => {
  const candidate = {
    streamId: 'conv',
    createdAt: 1700000000000,
    checkpointNamespace: 'epoch',
    checkpointId: 'head',
  };
  const claim = { ...candidate, ownerToken: 'redis-owner' };
  const plan = { tasks: [{ key: 'task', agentId: 'primary', nodeId: 'worker' }] };
  const agent = { id: 'primary', provider: 'openai', model: 'gpt-4o', tools: [] };

  function buildClient() {
    const client = Object.create(AgentClient.prototype);
    client.options = {
      req: {
        user: { id: 'owner', tenantId: 'tenant', role: 'USER' },
        body: { conversationId: 'conv' },
        config: { endpoints: {} },
      },
      agent,
      executionGrantResolver: async () => ({}),
      executionGrantJobId: 'conv',
      nativeMissionRecoverySignal: new AbortController().signal,
      nativeMissionReplayReceiptProof: async () => true,
    };
    client.getEncoding = () => 'cl100k_base';
    client.getReachableMissionAgents = () => [agent];
    client.publicationBarrier = { hold: () => true };
    client.conversationId = candidate.streamId;
    client.jobCreatedAt = candidate.createdAt;
    client.checkpointNamespace = candidate.checkpointNamespace;
    client.orchestratorPlan = plan;
    client.responseMessageId = 'response';
    client.parentMessageId = 'parent';
    client.persistTransientMissionOracleEvidence = async () => {};
    client.persistMissionOracleResult = async () => {};
    return client;
  }

  beforeEach(() => {
    jest
      .spyOn(AgentClient.prototype, 'createModelBoundChatModelCallback')
      .mockReturnValue(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('uses prototype-owned topology on plain clients without a copied method', () => {
    expect(
      AgentClient.prototype.getReachableMissionAgents.call({
        options: { agent },
        agentConfigs: new Map(),
      }),
    ).toEqual([agent]);
  });

  it('rebuilds a graph with an empty input and checkpoint-bound proof', async () => {
    const client = buildClient();
    const runOptions = await client.createNativeMissionColdRunOptions({ candidate, claim });
    expect(runOptions.agents).toEqual([agent]);
    expect(runOptions.orchestratorPlan).toBe(plan);
    expect(runOptions.messages).toEqual([]);
    expect(runOptions.hitlCapable).toBe(false);
    expect(runOptions.sessionStartSource).toBe('resume');
    expect(runOptions.toolExecution.executionGrantResolver).toBe(
      client.options.executionGrantResolver,
    );
    expect(runOptions.assertNativeMissionReplayFences({ candidate, claim })).toBeInstanceOf(
      Promise,
    );
    expect(() =>
      runOptions.assertNativeMissionReplayFences({ candidate, claim: { ...claim } }),
    ).toThrow('PROOF_IDENTITY_MISMATCH');
    const graph = { getState: async () => ({}), invoke: async () => {} };
    const builder = createNativeMissionColdGraphBuilder({
      createRun: async (options) => {
        expect(options.messages).toEqual([]);
        expect(options.hitlCapable).toBe(false);
        expect(options.assertNativeMissionReplayFences).toBeUndefined();
        return { Graph: { createWorkflow: () => graph } };
      },
    });
    await expect(
      builder({ client, candidate, claim, assertAuthorized: async () => {} }),
    ).resolves.toBe(graph);
  });

  it('prepares cold run options from an authenticated runtime without an HTTP request', async () => {
    const client = buildClient();
    client.options.agentRuntime = {
      user: client.options.req.user,
      appConfig: client.options.req.config,
      requestBody: client.options.req.body,
      turnStartedAt: candidate.createdAt,
    };
    delete client.options.req;
    const options = await client.createNativeMissionColdRunOptions({ candidate, claim });
    expect(options.user.id).toBe('owner');
    expect(options.tenantId).toBe('tenant');
    expect(options.messages).toEqual([]);
    expect(options.requestBody.conversationId).toBe('conv');
  });

  it('rejects missing owner fencing, publication barrier, or replay proof', async () => {
    for (const mutate of [
      (c) => {
        c.options.nativeMissionReplayReceiptProof = undefined;
      },
      (c) => {
        c.options.nativeMissionRecoverySignal = AbortSignal.abort();
      },
      (c) => {
        c.options.nativeMissionRecoverySignal = { aborted: false };
      },
      (c) => {
        c.options.executionGrantResolver = undefined;
      },
      (c) => {
        c.publicationBarrier.hold = () => false;
      },
    ]) {
      const client = buildClient();
      mutate(client);
      await expect(client.createNativeMissionColdRunOptions({ candidate, claim })).rejects.toThrow(
        'NATIVE_MISSION_COLD_RUN_UNAUTHORIZED',
      );
    }
  });
});
