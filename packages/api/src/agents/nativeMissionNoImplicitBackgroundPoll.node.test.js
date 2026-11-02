'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('signed native graph never advertises the background queue poll tool by inheritance', () => {
  const run = fs.readFileSync(path.join(__dirname, 'run.ts'), 'utf8');
  // Host inserts the poll tool into each agent input before compiling the
  // signed plan; the standalone native graph must never acquire that tool.
  assert.match(run, /if \(subagentTasks != null && orchestratorPlan == null\) \{\s*agentInput\.toolDefinitions = registerBackgroundTaskTool\(/);
  assert.equal((run.match(/agentInput\.toolDefinitions = registerBackgroundTaskTool\(/g) || []).length, 1);
});
test('native broker still blocks actual Analyst tools, no tool-list filtering or implicit fallback', () => {
  const native = fs.readFileSync(path.join(__dirname, 'orchestrator', 'native.ts'), 'utf8');
  assert.match(native, /binding\.tools\?\.length \|\|[\s\S]{0,150}binding\.toolDefinitions\?\.length \|\|[\s\S]{0,100}binding\.subagentConfigs\?\.length/);
  assert.match(native, /throw new Error\('NATIVE_GRAPH_BROKER_EFFECTS_UNSUPPORTED'\)/);
  assert.match(native, /if \(nativeGraphModelFetchFactory != null && !isResearchTask\(task\)\)/);
});
