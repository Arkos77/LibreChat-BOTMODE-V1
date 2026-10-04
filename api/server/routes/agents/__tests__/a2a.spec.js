const express = require('express');
const request = require('supertest');

jest.mock('~/server/controllers/agents/responses', () => ({
  createResponse: jest.fn(async (_req, res) => {
    res.status(200).json({
      status: 'completed',
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'A2A response ok' }],
        },
      ],
    });
  }),
}));

jest.mock('~/models', () => ({
  getAgent: jest.fn(async (id) => ({
    id,
    name: 'Test Agent',
    description: 'Test',
  })),
}));

jest.mock('../middleware', () => ({
  checkAgentPermission: (_req, _res, next) => next(),
  checkRemoteAgentsFeature: (_req, _res, next) => next(),
  preAuthTenantMiddleware: (_req, _res, next) => next(),
  requireRemoteAgentAuth: (req, _res, next) => {
    req.user = { id: 'user-1' };
    next();
  },
}));

describe('A2A route', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    app = express();
    app.use(express.json());
    app.use('/api/agents/a2a', require('../a2a'));
  });

  it('returns an Agent Card with JSON-RPC interface metadata', async () => {
    const response = await request(app).get('/api/agents/a2a/agent-1/.well-known/agent-card.json');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      name: 'Test Agent',
      supportedInterfaces: [
        {
          protocolBinding: 'JSONRPC',
          protocolVersion: '1.0',
        },
      ],
      capabilities: {
        streaming: false,
        pushNotifications: false,
      },
    });
    expect(response.body.supportedInterfaces[0].url).toContain('/message:send');
  });

  it('rejects invalid A2A version and malformed JSON-RPC', async () => {
    const invalidVersion = await request(app)
      .post('/api/agents/a2a/agent-1/message:send')
      .set('A2A-Version', '0.3')
      .send({ jsonrpc: '2.0', id: 1, method: 'message/send', params: {} });
    expect(invalidVersion.status).toBe(400);
    expect(invalidVersion.body.error.message).toMatch(/A2A version/);

    const malformed = await request(app)
      .post('/api/agents/a2a/agent-1/message:send')
      .set('A2A-Version', '1.0')
      .send({ jsonrpc: '2.0', id: 2, method: 'other/method', params: {} });
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe(-32600);
  });

  it('reuses the existing Responses execution path for message/send', async () => {
    const response = await request(app)
      .post('/api/agents/a2a/agent-1/message:send')
      .set('A2A-Version', '1.0')
      .send({
        jsonrpc: '2.0',
        id: 7,
        method: 'message/send',
        params: {
          message: {
            messageId: 'msg-1',
            role: 'ROLE_USER',
            parts: [{ text: 'Hello' }],
          },
        },
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      jsonrpc: '2.0',
      id: 7,
      result: {
        task: {
          status: {
            state: 'TASK_STATE_COMPLETED',
            message: {
              role: 'ROLE_AGENT',
              parts: [{ text: 'A2A response ok' }],
            },
          },
        },
      },
    });
  });
});
