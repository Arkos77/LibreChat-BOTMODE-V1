'use strict';
const assert = require('node:assert/strict');
const {
  readNativeMissionRecoveredGraphOutputs: read,
} = require('../../api/server/services/Endpoints/agents/nativeMissionRecoveredGraphOutput');

const plan = { tasks: [{ taskId: 'mission/main', nodeId: 'p6_main' }] };
const ai = { _getType: () => 'ai', content: '{"ok":true}', tool_calls: [] };
const terminal = {
  next: [],
  tasks: [],
  values: { messages: [{ _getType: () => 'human', content: 'prompt' }, ai] },
};
const recovered = read({ state: terminal, plan, originalModelOnly: true });
assert.deepEqual(recovered, { p6_main: { content: '{"ok":true}' } });
assert.equal(Object.isFrozen(recovered), true);

for (const invalid of [
  { ...terminal, next: ['p6_main'] },
  { ...terminal, tasks: [{ name: 'p6_main' }] },
  { ...terminal, values: { messages: [] } },
  { ...terminal, values: { messages: [{ _getType: () => 'human', content: '{"ok":true}' }] } },
  { ...terminal, values: { messages: [{ _getType: () => 'tool', content: '{"ok":true}' }] } },
  { ...terminal, values: { messages: [{ type: 'ai', content: '' }] } },
  { ...terminal, values: { messages: [{ type: 'ai', content: '{"ok":true}', tool_calls: [{}] }] } },
  {
    ...terminal,
    values: { messages: [{ type: 'ai', content: '{"ok":true}', invalid_tool_calls: [{}] }] },
  },
  {
    ...terminal,
    values: {
      messages: [{ type: 'ai', content: '{"ok":true}', additional_kwargs: { tool_calls: [{}] } }],
    },
  },
  {
    ...terminal,
    values: { messages: [{ type: 'ai', content: '{"ok":true}', tool_call_chunks: [{}] }] },
  },
]) {
  assert.throws(
    () => read({ state: invalid, plan, originalModelOnly: true }),
    /NOT_TERMINAL|OUTPUTS_INVALID/,
  );
}
assert.throws(
  () => read({ state: terminal, plan, originalModelOnly: false }),
  /GRAPH_NOT_TERMINAL/,
);
assert.throws(
  () =>
    read({
      state: terminal,
      plan: { tasks: [...plan.tasks, { nodeId: 'p6_specialist' }] },
      originalModelOnly: true,
    }),
  /GRAPH_NOT_TERMINAL/,
);
// Multi-agent graph remains source-addressed and cannot infer an output.
const multi = {
  next: [],
  tasks: [],
  values: { agentOutputs: { p6_main: { content: '{"ok":true}' } } },
};
assert.deepEqual(read({ state: multi, plan, originalModelOnly: false }), multi.values.agentOutputs);
console.log('BOTMODE_RECOVERED_STANDARD_GRAPH_CHECKPOINT_AI_OUTPUT=PASS');
console.log('BOTMODE_RECOVERED_STANDARD_GRAPH_NO_TOOL_NO_FOREIGN_NODE=PASS');
