'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

test('original graph recovery registers only after Redis stream manager configuration', () => {
  const source = readFileSync(join(__dirname, '../../..', 'index.js'), 'utf8');
  const boot = source.slice(source.indexOf('const startServer = async () => {'));
  assert.match(boot, /configureGenerationStreams\(\);\s*configureOriginalGraphRecoveryAfterStreams\(\);/);
  const registrar = source.slice(
    source.indexOf('const configureOriginalGraphRecoveryAfterStreams = () => {'),
    source.indexOf('const startServer = async () => {'),
  );
  assert.match(registrar, /GenerationJobManager\.isRedis/);
  assert.match(registrar, /app\.locals\.nativeMissionModelOnlyRecoveryHandler/);
  assert.match(registrar, /setNativeMissionRecoveryHandler\(async \(candidate\)/);
  assert.match(registrar, /if \(job\.nativeMissionCapabilityAttestation\?\.mode === 'receipts_required'\)/);
  assert.match(registrar, /if \(job\.nativeMissionCapabilityAttestation\?\.mode === 'model_only'\)/);
  assert.match(source, /app\.locals\.nativeMissionOriginalGraphRequestIntentStore = requestIntents/);
});
