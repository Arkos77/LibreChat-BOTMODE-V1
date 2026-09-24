const { EventEmitter } = require('events');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createAutonomyMandateMethods } = require('@librechat/data-schemas');
const { Run, Providers, FakeChatModel } = require('@librechat/agents');
const { HumanMessage } = require('@librechat/agents/langchain/messages');
const { Constants } = require('librechat-data-provider');
const {
  MCPManager,
  MCPServersRegistry,
  buildHITLRunWiring,
  createToolExecuteHandler,
} = require('@librechat/api');

let mockManager;
jest.mock('~/config', () => ({
  getMCPManager: () => mockManager,
  getFlowStateManager: () => ({}),
  getMCPServersRegistry: () => ({}),
  getOAuthReconnectionManager: jest.fn(),
}));
jest.mock('~/cache', () => ({ getLogStores: () => ({}) }));
jest.mock('~/models', () => ({
  findToken: jest.fn(),
  createToken: jest.fn(),
  updateToken: jest.fn(),
  deleteTokens: jest.fn(),
}));
jest.mock('./Config', () => ({ getAppConfig: async () => ({}) }));
jest.mock('./Tools/mcp', () => ({ reinitMCPServer: jest.fn() }));
jest.mock('./GraphTokenService', () => ({ getGraphApiToken: jest.fn() }));
jest.mock('./OboTokenService', () => ({ exchangeOboToken: jest.fn() }));
jest.mock('./OboPolicyService', () => ({ createOboTrustChecker: () => jest.fn() }));
jest.mock('./OpenIDSessionRefresh', () => ({ createOpenIDSessionTokenProvider: jest.fn() }));
const { createMCPTool } = require('./MCP');

const name = `counter${Constants.mcp_delimiter}synthetic`;
const scope = { userId: 'owner', tenantId: 'tenant' };
let server;
let mandates;
beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { dbName: 'p8_mcp_authority' });
  mandates = createAutonomyMandateMethods(mongoose);
});
beforeEach(async () => {
  await mongoose.models.AutonomyMandate.deleteMany({});
});
afterEach(() => jest.restoreAllMocks());
afterAll(async () => {
  await mongoose.disconnect();
  await server?.stop();
});

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test.each(['missing-context', 'legacy', 'lookup-failure'])(
  '%s during native MCP connection wait',
  async (mode) => {
    const expiresAt = new Date(Date.now() + 60_000);
    const mandate = await mandates.createAutonomyMandate(
      scope,
      { actorId: 'actor', conversationId: 'thread' },
      {
        allowedCapabilities: [name],
        deniedCapabilities: [],
        validFrom: new Date(0),
        expiresAt,
        reason: 'synthetic MCP test',
      },
    );
    const entered = deferred();
    const release = deferred();
    let dispatchCount = 0;
    let remoteEffectCount = 0;
    const connection = Object.assign(new EventEmitter(), {
      client: {
        request: async () => {
          dispatchCount++;
          remoteEffectCount++;
          return { content: [{ type: 'text', text: 'counted' }], isError: false };
        },
      },
      isConnected: async () => {
        entered.resolve();
        await release.promise;
        return true;
      },
      usesOAuth: () => false,
      setRequestHeaders: () => {},
      timeout: 1000,
    });
    mockManager = new MCPManager();
    jest.spyOn(mockManager, 'getConnection').mockResolvedValue(connection);
    jest.spyOn(MCPServersRegistry, 'getInstance').mockReturnValue({});
    const user = { id: 'owner', role: 'USER', tenantId: 'tenant' };
    const mcp = await createMCPTool({
      user,
      serverName: 'synthetic',
      toolKey: name,
      provider: 'openai',
      config: { type: 'stdio', command: 'never-spawned', source: 'yaml' },
      mcpPermissionContext: { canUseServers: async () => true },
      availableTools: {
        [name]: {
          function: {
            name,
            description: 'in-memory counter',
            parameters: { type: 'object', properties: {} },
          },
        },
      },
    });
    if (mode === 'missing-context') {
      const invoke = mcp.invoke.bind(mcp);
      jest.spyOn(mcp, 'invoke').mockImplementation((input, config) => {
        expect(config.toolCall.effectAuthorityRequired).toBe(true);
        return invoke(input, {
          ...config,
          toolCall: { ...config.toolCall, hookContext: undefined },
        });
      });
    }
    const read = jest.spyOn(mongoose.models.AutonomyMandate, 'findOne');
    const wiring = buildHITLRunWiring(
      { enabled: true, mode: 'bypass' },
      {
        ...scope,
        conversationId: 'thread',
        ...(mode === 'legacy' ? {} : { autonomyMandateId: mandate._id }),
      },
    );
    const run = await Run.create({
      runId: 'run',
      ...wiring,
      customHandlers: {
        on_tool_execute: createToolExecuteHandler({
          loadTools: async () => ({ loadedTools: [mcp] }),
        }),
      },
      graphConfig: {
        type: 'standard',
        agents: [
          {
            agentId: 'actor',
            provider: Providers.OPENAI,
            toolDefinitions: [
              {
                name,
                description: 'synthetic MCP',
                parameters: { type: 'object', properties: {} },
              },
            ],
          },
        ],
      },
    });
    run.Graph.overrideModel = new FakeChatModel({
      responses: ['done'],
      toolCalls: [{ id: 'mcp-call', name, args: {} }],
    });
    const pending = run.processStream(
      { messages: [new HumanMessage('Synthetic call')] },
      {
        version: 'v2',
        configurable: { thread_id: 'thread', user_id: 'owner', user },
        recursionLimit: 8,
      },
    );
    await entered.promise;
    expect(remoteEffectCount).toBe(0);
    expect(read).toHaveBeenCalledTimes(mode === 'legacy' ? 0 : 1);
    read.mockClear();
    if (mode === 'lookup-failure') {
      read.mockImplementationOnce(() => {
        throw new Error('synthetic authority read failure');
      });
    }
    release.resolve();
    await pending;
    console.info(
      JSON.stringify({
        mode,
        effectTimeReads: read.mock.calls.length,
        dispatchCount,
        remoteEffectCount,
      }),
    );
    expect(remoteEffectCount).toBe(mode === 'legacy' ? 1 : 0);
    expect(dispatchCount).toBe(mode === 'legacy' ? 1 : 0);
    expect(read).toHaveBeenCalledTimes(mode === 'lookup-failure' ? 1 : 0);
  },
);
