#!/usr/bin/env node
'use strict';

/**
 * Canonicalize the Agents SDK across LibreChat's API workspaces after npm
 * installation/pruning. These packages must share one Run constructor:
 * controller-side Mission Oracle consumes the instance created by @librechat/api.
 * Do not patch SDK prototypes or substitute fabricated task outputs.
 *
 * Intended for Docker build stages rooted at /app; fail the build on mismatch.
 */
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const apiRequire = createRequire('/app/api/package.json');
const apiEntry = apiRequire.resolve('@librechat/agents');
const apiSdk = apiRequire('@librechat/agents');
if (typeof apiSdk.Run?.prototype?.getAgentOutputs !== 'function') {
  throw new Error('BOTMODE_AGENTS_SDK_OUTPUT_ACCESSOR_MISSING');
}

function sdkRoot(entry) {
  let dir = path.dirname(entry);
  for (let count = 0; count < 15; count += 1) {
    const manifest = path.join(dir, 'package.json');
    if (fs.existsSync(manifest)) {
      const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      if (pkg.name === '@librechat/agents') return fs.realpathSync(dir);
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('BOTMODE_AGENTS_SDK_PACKAGE_ROOT_MISSING');
}

const canonicalRoot = sdkRoot(apiEntry);
const sharedTarget = '/app/packages/api/node_modules/@librechat/agents';
if (path.resolve(canonicalRoot) !== path.resolve(sharedTarget)) {
  fs.mkdirSync(path.dirname(sharedTarget), { recursive: true });
  fs.rmSync(sharedTarget, { recursive: true, force: true });
  fs.symlinkSync(canonicalRoot, sharedTarget, 'dir');
}
const sharedRequire = createRequire('/app/packages/api/dist/index.cjs');
const sharedEntry = sharedRequire.resolve('@librechat/agents');
if (fs.realpathSync(apiEntry) !== fs.realpathSync(sharedEntry)) {
  throw new Error('BOTMODE_AGENTS_SDK_MODULE_PATH_MISMATCH');
}
if (sharedRequire('@librechat/agents').Run !== apiSdk.Run) {
  throw new Error('BOTMODE_AGENTS_SDK_RUN_IDENTITY_MISMATCH');
}
console.log('BOTMODE_AGENTS_SDK_SINGLETON=PASS');
