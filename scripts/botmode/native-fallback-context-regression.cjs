'use strict';
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

async function check(sdkRoot, format, allowed) {
  const suffix = format === 'esm' ? 'mjs' : 'cjs';
  const load = (file) =>
    format === 'esm'
      ? import(pathToFileURL(path.join(sdkRoot, 'dist/esm', file + '.' + suffix)).href)
      : require(path.join(sdkRoot, 'dist/cjs', file + '.' + suffix));
  const { Run, Providers } = await load('main');
  const { HumanMessage } = await load('langchain/messages');
  const requests = [];
  let handlerError;
  const server = createServer(async (req, res) => {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      const primary = req.url.startsWith('/primary/');
      const child = body.messages.some(
        (m) => m.role === 'user' && JSON.stringify(m.content).includes('CHILD_TASK_SENTINEL'),
      );
      const system = body.messages
        .filter((m) => m.role === 'system' || m.role === 'developer')
        .map((m) => JSON.stringify(m.content))
        .join('\n');
      assert.equal(system.split('OWNER_POLICY_SENTINEL').length - 1, 1);
      assert.equal(system.split('DYNAMIC_POLICY_SENTINEL').length - 1, 1);
      requests.push({ primary, child, tools: body.tools?.map((t) => t.function?.name) ?? [] });
      assert(!requests.at(-1).tools.includes('deferred_forbidden'));
      if (primary) {
        res.writeHead(429, { 'content-type': 'application/json' });
        res.end('{"error":{"message":"controlled limit","type":"rate_limit_exceeded"}}');
        return;
      }
      const toolReply = body.messages.some((m) => m.role === 'tool');
      res.writeHead(200, { 'content-type': 'text/event-stream', connection: 'close' });
      const emit = (delta, finish_reason = null) =>
        res.write(
          'data: ' +
            JSON.stringify({
              id: 'local-' + requests.length,
              object: 'chat.completion.chunk',
              created: 1700000000,
              model: 'secondary:free',
              choices: [{ index: 0, delta, finish_reason }],
            }) +
            '\n\n',
        );
      emit({ role: 'assistant' });
      if (child) {
        emit({ content: 'CHILD_OK' });
        emit({}, 'stop');
      } else if (!toolReply) {
        assert(requests.at(-1).tools.includes('subagent'));
        emit({
          tool_calls: [
            {
              index: 0,
              id: 'declared-child',
              type: 'function',
              function: {
                name: 'subagent',
                arguments: JSON.stringify({
                  subagent_type: allowed ? 'authorized-self' : 'forbidden',
                  description: 'CHILD_TASK_SENTINEL Return CHILD_OK only.',
                }),
              },
            },
          ],
        });
        emit({}, 'tool_calls');
      } else {
        const replies = body.messages
          .filter((m) => m.role === 'tool')
          .map((m) => JSON.stringify(m.content))
          .join('\n');
        if (allowed) assert(replies.includes('CHILD_OK'));
        else assert(/forbidden|invalid|not allowed|unknown|schema/i.test(replies));
        emit({ content: allowed ? 'FINAL_OK' : 'Delegation refused.' });
        emit({}, 'stop');
      }
      res.end('data: [DONE]\n\n');
    } catch (error) {
      handlerError = error;
      res.destroy();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = server.address().port;
    const options = (route, model) => ({
      model,
      apiKey: 'local-dummy',
      maxTokens: 128,
      maxRetries: 0,
      timeout: 2000,
      configuration: { baseURL: `http://127.0.0.1:${port}/${route}/v1` },
    });
    const input = {
      agentId: 'owner',
      provider: Providers.OPENROUTER,
      instructions: 'OWNER_POLICY_SENTINEL',
      additional_instructions: 'DYNAMIC_POLICY_SENTINEL',
      clientOptions: {
        ...options('primary', 'primary:free'),
        fallbacks: [
          {
            provider: Providers.OPENROUTER,
            clientOptions: options('secondary', 'secondary:free'),
            retryOn: 'MODEL_RATE_LIMIT_ZERO_CHUNK',
          },
        ],
      },
      toolDefinitions: [
        {
          name: 'deferred_forbidden',
          description: 'Undiscovered tool must stay hidden',
          defer_loading: true,
          parameters: { type: 'object', properties: {} },
        },
      ],
      subagentConfigs: [
        {
          type: 'authorized-self',
          name: 'Authorized child',
          self: true,
          description: 'Controlled child only',
        },
      ],
    };
    const run = await Run.create({
      runId: `fallback-${format}-${allowed}`,
      graphConfig: { type: 'standard', agents: [input] },
    });
    await run.processStream(
      { messages: [new HumanMessage('START_PARENT')] },
      { version: 'v2', recursionLimit: 12 },
    );
    assert.ifError(handlerError);
    assert.equal(requests.filter((r) => r.child && !r.primary).length, allowed ? 1 : 0);
    assert(requests.some((r) => r.primary));
    console.log(
      JSON.stringify({
        format,
        allowed,
        child_calls: allowed ? 1 : 0,
        requests: requests.length,
        passed: true,
      }),
    );
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

(async () => {
  const supplied = process.argv[2];
  if (!supplied) throw Error('Explicit isolated SDK root required');
  const sdkRoot = path.resolve(supplied);
  for (const format of ['cjs', 'esm'])
    for (const allowed of [true, false]) await check(sdkRoot, format, allowed);
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
