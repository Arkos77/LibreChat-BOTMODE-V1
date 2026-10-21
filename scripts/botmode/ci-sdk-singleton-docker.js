#!/usr/bin/env node
'use strict';
// CI-only packaging proof. Normalizes the shared workspace's SDK resolution
// to the exact host-authorized SDK already installed for the api workspace.
// No monkeypatching of Run/Graph, no extra authority and no network traffic.
// The candidate source remains pinned; modified CI images are NOT release builds.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const apiRequire = createRequire('/app/api/package.json');
const apiEntry = apiRequire.resolve('@librechat/agents');
const apiSdk = apiRequire('@librechat/agents');
if (typeof apiSdk.Run?.prototype?.getAgentOutputs !== 'function') {
  throw new Error('CI_SDK_CANONICAL_ACCESSOR_MISSING');
}
function packageRoot(entry) {
  let dir = path.dirname(entry);
  for (let n = 0; n < 15; n++) {
    const file = path.join(dir, 'package.json');
    if (fs.existsSync(file)) {
      const info = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (info.name === '@librechat/agents') return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('CI_SDK_CANONICAL_PACKAGE_ROOT_MISSING');
}
const root = fs.realpathSync(packageRoot(apiEntry));
const sharedTarget = '/app/packages/api/node_modules/@librechat/agents';
if (path.resolve(sharedTarget) !== path.resolve(root)) {
  fs.mkdirSync(path.dirname(sharedTarget), {recursive: true});
  fs.rmSync(sharedTarget, {recursive: true, force: true});
  fs.symlinkSync(root, sharedTarget, 'dir');
}
const sharedRequire = createRequire('/app/packages/api/dist/index.cjs');
const sharedEntry = sharedRequire.resolve('@librechat/agents');
if (fs.realpathSync(apiEntry) !== fs.realpathSync(sharedEntry)) {
  throw new Error('CI_SDK_RUNTIME_PATH_DIVERGES');
}
const sharedSdk = sharedRequire('@librechat/agents');
if (sharedSdk.Run !== apiSdk.Run) {
  throw new Error('CI_SDK_RUNTIME_CONSTRUCTOR_DIVERGES');
}
console.log('CI_SDK_RUNTIME_SINGLETON=PASS');
