'use strict';
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { z } = require('zod');
const { Run, Providers } = require('@librechat/agents');
const { HumanMessage } = require('@librechat/agents/langchain/messages');
const { DynamicStructuredTool } = require('@librechat/agents/langchain/tools');
const {
  deterministicPlanner,
  prepareBotModeMission,
  compileNativePlan,
  validateMissionTask,
  assertMissionTaskVerified,
  buildWebSearchContext,
} = require('../../packages/api/dist/index.cjs');

async function check(mode) {
  const requests = [];
  const primary = [];
  const observed = [];
  let effects = 0;
  let sourcesReady = false;
  const suffix = mode === 'native-citation-unicode' ? '\ue202turn0search0'
    : mode === 'native-citation-escaped' ? '\\ue202turn0search0' : '';
  const anchorOnly = mode === 'native-anchor-only';
  const candidate = JSON.stringify({
    ok: true,
    result: anchorOnly ? 'Controlled report \ue202turn0search0'
      : 'Synthetic source https://example.invalid/report' + (suffix ? '.' + suffix : ''),
    sources: 'https://example.invalid/report',
  });
  const server = createServer(async (req, res) => {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const input = JSON.parse(body);
      const system = input.messages.filter(m => ['system','developer'].includes(m.role))
        .map(m => JSON.stringify(m.content)).join('\n');
      assert(system.includes('INTERNAL RESEARCH OUTPUT'));
      assert(!system.includes('CITATION FORMAT - UNICODE'));
      assert(system.includes('Reproduce each cited observed URL literally'));
      const shape = {
        choice: input.tool_choice,
        format: input.response_format,
        hasToolResult: input.messages.some((message) => message.role === 'tool'),
      };
      if (shape.hasToolResult)
        assert.equal(sourcesReady, true, 'source barrier must precede result HTTP');
      if (req.url.startsWith('/primary/')) {
        primary.push(shape);
        res.writeHead(429, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({ error: { message: 'fixture rate limit', type: 'rate_limit_exceeded' } }),
        );
        return;
      }
      requests.push(shape);
      assert(input.tools.some((tool) => tool.function?.name === 'web_search'));
      res.writeHead(200, { 'content-type': 'text/event-stream', connection: 'close' });
      const send = (delta, finish_reason = null) =>
        res.write(
          'data: ' +
            JSON.stringify({
              id: `image-${mode}-${requests.length}`,
              object: 'chat.completion.chunk',
              created: 1700000000,
              model: 'offline:free',
              choices: [{ index: 0, delta, finish_reason }],
            }) +
            '\n\n',
        );
      send({ role: 'assistant' });
      if (!shape.hasToolResult && mode === 'prose') {
        send({ content: 'Je vais rechercher.' });
        send({}, 'stop');
      } else if (!shape.hasToolResult) {
        send({
          tool_calls: [
            {
              index: 0,
              id: 'image-search',
              type: 'function',
              function: { name: 'web_search', arguments: '{"query":"synthetic"}' },
            },
          ],
        });
        send({}, 'tool_calls');
      } else {
        send({ content: candidate });
        send({}, 'stop');
      }
      res.end('data: [DONE]\n\n');
    } catch {
      res.destroy();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const baseURL = `http://127.0.0.1:${server.address().port}`;
    const tool = new DynamicStructuredTool({
      name: 'web_search',
      description: 'Synthetic local source',
      schema: z.object({ query: z.string() }),
      func: async () => {
        effects++;
        if (mode === 'tool-error') throw new Error('fixture tool refusal');
        observed.push({ toolCallId: 'image-search', urls: ['https://example.invalid/report'] });
        return 'Synthetic source https://example.invalid/report';
      },
    });
    const plan = deterministicPlanner.planMission(
      prepareBotModeMission({
        missionId: `image-${mode}`,
        taskId: 'root',
        objective: 'Synthetic research',
        requiredCapabilities: ['web_search'],
        constraints: [],
      }),
      {
        worker: {
          id: 'worker',
          agentId: 'saved',
          role: 'worker',
          capabilities: ['web_search'],
          constraints: [],
        },
        specialists: [],
      },
    );
    const options = (route) => ({
      model: 'offline:free',
      apiKey: 'fixture-not-a-real-key',
      maxRetries: 0,
      timeout: 5000,
      configuration: { baseURL: `${baseURL}/${route}` },
    });
    const binding = {
      agentId: 'saved',
      provider: mode.startsWith('native-') ? Providers.OPENROUTER : Providers.OPENAI,
      instructions: ['Owner policy', buildWebSearchContext()].join('\n'),
      tools: [tool],
      subagentConfigs: [{ type: 'authorized-self', name: 'Authorized child', self: true, description: 'Controlled context' }],
      clientOptions: {
        ...options(mode === 'fallback429' ? 'primary/v1' : 'v1'),
        ...(mode === 'fallback429'
          ? {
              fallbacks: [
                {
                  provider: Providers.OPENAI,
                  clientOptions: options('v1'),
                  retryOn: 'MODEL_RATE_LIMIT_ZERO_CHUNK',
                },
              ],
            }
          : {}),
      },
    };
    const compiled = compileNativePlan(
      plan,
      new Map([['saved', binding]]),
      undefined,
      undefined,
      undefined,
      async (taskId) => {
        assert.equal(taskId, plan.tasks[0].taskId);
        sourcesReady = observed.length > 0;
        return structuredClone(observed);
      },
    );
    assert.equal(compiled.actors.length, 2, 'compiled research must have two phases');
    const run = await Run.create({ runId: `image-${mode}`, graphConfig: compiled.graphConfig });
    const execute = () =>
      run.processStream(
        { messages: [new HumanMessage('Synthetic research')] },
        { version: 'v2', recursionLimit: 12 },
      );
    const observation = {
      choice: { type: 'function', function: { name: 'web_search' } },
      format: undefined,
      hasToolResult: false,
    };
    if (mode === 'prose' || mode === 'tool-error') {
      await assert.rejects(execute);
      assert.deepEqual(requests, [observation]);
      assert.equal(effects, mode === 'prose' ? 0 : 1);
      assert.equal(run.getAgentOutputs()[plan.tasks[0].nodeId], undefined);
    } else {
      await execute();
      assert.deepEqual(
        requests.map(({ choice, hasToolResult }) => ({ choice, hasToolResult })),
        [
          { choice: observation.choice, hasToolResult: false },
          { choice: 'auto', hasToolResult: true },
        ],
      );
      assert.equal(requests[0].format, undefined);
      assert.equal(requests[1].format.type, 'json_schema');
      assert.equal(requests[1].format.json_schema.strict, true);
      assert.deepEqual(requests[1].format.json_schema.schema.required, ['result', 'sources', 'ok']);
      assert.equal(effects, 1);
      if (mode === 'fallback429') assert.deepEqual(primary, requests);
      const task = plan.tasks[0];
      const output = run.getAgentOutputs()[task.nodeId];
      assert.equal(output.content, candidate);
      const verdict = await validateMissionTask({
        taskId: task.taskId,
        nodeId: task.nodeId,
        agentId: task.agentId,
        candidate: output.content,
        requirements: task.validation,
        observedSources: observed,
      });
      if (anchorOnly) {
        assert(verdict.verdicts.some(v => v.status === 'REJECTED'));
        assert.throws(() => assertMissionTaskVerified(verdict));
      } else {
        assertMissionTaskVerified(verdict);
      }
    }
    console.log(`BOTMODE_COMPILED_RESEARCH_${mode.toUpperCase().replaceAll('-', '_')}=PASS`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

module.exports = { check };
if (require.main === module) (async () => {
  for (const mode of ['success', 'prose', 'tool-error', 'fallback429', 'native-openrouter', 'native-citation-unicode', 'native-citation-escaped', 'native-anchor-only'])
    await check(mode);
  console.log(
    'SCOPE=compiled API and native SDK; synthetic loopback only; no host/browser/cold recovery proof',
  );
})().catch((error) => {
  console.error('BOTMODE_COMPILED_RESEARCH=FAIL', error.name, error.message);
  process.exitCode = 1;
});
