'use strict';

const assert = require('node:assert/strict');
const { HumanMessage, AIMessage } = require('@langchain/core/messages');
const attachMock = require('../../e2e/setup/fake-model');

async function invoke(messages) {
  const graph = { overrideTestModel() {} };
  // A genuine cold reconstruction passes NO messages at graph build time.
  // The original user turn is present only at the eventual model invocation.
  attachMock({ Graph: graph }, { messages: [], agents: [], conversationId: 'cold-replay' });
  assert.ok(graph.overrideModel, 'the mock provider must be active');
  let content = '';
  for await (const chunk of graph.overrideModel._streamResponseChunks(
    messages,
    {},
    { handleCustomEvent() {}, handleLLMNewToken() {} },
  )) {
    if (typeof chunk.text === 'string') content += chunk.text;
  }
  return content;
}

(async () => {
  const marker = 'E2E_MISSION_ORACLE_DELAYED_JSON:test-cold-123';
  const exact = await invoke([new HumanMessage(marker)]);
  assert.equal(exact, '{"ok":true}', 'restored original prompt must drive fake provider');
  assert.deepEqual(JSON.parse(exact), { ok: true });
  assert.equal(await invoke([new HumanMessage('ordinary prompt')]), 'E2E mock reply: pong');
  assert.equal(
    await invoke([new AIMessage(marker)]),
    'E2E mock reply: pong',
    'an AI-only checkpoint cannot impersonate an authenticated user prompt',
  );
  assert.equal(
    await invoke([new HumanMessage(marker), new HumanMessage('ordinary followup')]),
    'E2E mock reply: pong',
    'a previous user turn cannot override the latest user request',
  );
  console.log('BOTMODE_COLD_ORACLE_REAL_FAKE_MODEL_CHECKPOINT_ROUTING=PASS');
  console.log('BOTMODE_COLD_ORACLE_NO_MARKER_NO_FABRICATED_VERDICT=PASS');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
