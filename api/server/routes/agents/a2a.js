const express = require('express');
const { createResponse } = require('~/server/controllers/agents/responses');
const {
  checkAgentPermission,
  checkRemoteAgentsFeature,
  preAuthTenantMiddleware,
  requireRemoteAgentAuth,
} = require('./middleware');
const db = require('~/models');

const router = express.Router();
const A2A_VERSION = '1.0';

function rpcError(code, message, id = null) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function extractText(message) {
  if (!message || message.role !== 'ROLE_USER' || !Array.isArray(message.parts)) {
    throw new Error('A2A message must contain ROLE_USER parts');
  }
  const text = message.parts
    .filter((part) => part && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n')
    .trim();
  if (!text) throw new Error('A2A message requires text content');
  return text;
}

function toA2aResponse(response, taskId, contextId) {
  const output = Array.isArray(response?.output) ? response.output : [];
  const text = output
    .filter((item) => item?.type === 'message')
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .filter((part) => part?.type === 'output_text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n')
    .trim();
  return {
    task: {
      id: taskId,
      contextId,
      status: {
        state: response?.status === 'completed' ? 'TASK_STATE_COMPLETED' : 'TASK_STATE_FAILED',
        timestamp: new Date().toISOString(),
        ...(text
          ? {
              message: {
                messageId: taskId + ':agent',
                role: 'ROLE_AGENT',
                parts: [{ text, mediaType: 'text/plain' }],
              },
            }
          : {}),
      },
    },
  };
}

function createCaptureResponse() {
  let statusCode = 200;
  let payload;
  const capture = {
    get headersSent() {
      return false;
    },
    status(code) {
      statusCode = code;
      return capture;
    },
    json(body) {
      payload = body;
      return capture;
    },
    set() {
      return capture;
    },
    setHeader() {
      return capture;
    },
    end() {
      return capture;
    },
    write() {
      return true;
    },
    flushHeaders() {
      return capture;
    },
  };
  return { response: capture, getResult: () => ({ statusCode, payload }) };
}

async function messageSend(req, res) {
  const rpcId = req.body?.id ?? null;
  try {
    if (req.get('A2A-Version') !== A2A_VERSION) {
      return res.status(400).json(rpcError(-32001, 'A2A version must be ' + A2A_VERSION, rpcId));
    }
    if (req.body?.jsonrpc !== '2.0' || req.body?.method !== 'message/send') {
      return res.status(400).json(rpcError(-32600, 'Invalid A2A request', rpcId));
    }
    const text = extractText(req.body?.params?.message);
    const contextId = req.body?.params?.message?.contextId || 'a2a-' + req.user.id;
    const taskId = req.body?.params?.message?.taskId || req.requestId || 'a2a-' + Date.now();
    const childReq = { ...req, body: { model: req.params.model, input: text, stream: false } };
    const captured = createCaptureResponse();
    await createResponse(childReq, captured.response);
    const result = captured.getResult();
    if (result.statusCode < 200 || result.statusCode >= 300 || !result.payload) {
      return res
        .status(result.statusCode || 500)
        .json(rpcError(-32000, 'Agent execution failed', rpcId));
    }
    return res.status(200).json({
      jsonrpc: '2.0',
      id: rpcId,
      result: toA2aResponse(result.payload, taskId, contextId),
    });
  } catch (error) {
    return res
      .status(400)
      .json(
        rpcError(-32602, error instanceof Error ? error.message : 'Invalid A2A request', rpcId),
      );
  }
}

async function agentCard(req, res) {
  const agent = await db.getAgent(req.params.model);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  return res.json({
    name: agent.name || agent.id,
    description: agent.description || 'LibreChat BOT MODE agent',
    supportedInterfaces: [
      {
        url:
          req.protocol +
          '://' +
          req.get('host') +
          '/api/agents/a2a/' +
          encodeURIComponent(agent.id) +
          '/message:send',
        protocolBinding: 'JSONRPC',
        protocolVersion: A2A_VERSION,
      },
    ],
    capabilities: { streaming: false, pushNotifications: false, extendedAgentCard: false },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
    skills: [
      {
        id: 'librechat-agent-' + agent.id,
        name: agent.name || agent.id,
        description: agent.description || 'LibreChat BOT MODE agent',
        tags: ['librechat', 'botmode'],
      },
    ],
  });
}

router.use(preAuthTenantMiddleware);
router.use(requireRemoteAgentAuth);
router.use(checkRemoteAgentsFeature);
router.get('/:model/.well-known/agent-card.json', checkAgentPermission, agentCard);
router.post('/:model/message:send', checkAgentPermission, messageSend);

module.exports = router;
