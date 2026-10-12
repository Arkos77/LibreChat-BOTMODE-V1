#!/usr/bin/env python3
"""Patch disposable PR14 Dockerfile to install Playwright without npm root re-resolution.

The checkout is strictly CI-only. No source-candidate commit or package lock is changed.
"""
from pathlib import Path

p = Path("Dockerfile")
s = p.read_text()
a = r"""RUN npm install --no-save --package-lock=false --omit=dev "playwright@${PLAYWRIGHT_VERSION}" \
    && npx playwright install --with-deps chromium \
    && node -e "const { chromium } = require('playwright'); const fs = require('fs'); const p = chromium.executablePath(); if (!fs.existsSync(p)) { throw new Error('Playwright Chromium missing: ' + p); } console.log('BOTMODE_PLAYWRIGHT=' + p);" \
    && npm cache clean --force"""
b = r"""RUN set -eu; \
    mkdir -p /tmp/botmode-playwright-install; \
    printf '{"name":"botmode-playwright-install","private":true,"version":"1.0.0"}\n' > /tmp/botmode-playwright-install/package.json; \
    npm --prefix /tmp/botmode-playwright-install install --no-save --package-lock=false --omit=dev "playwright@${PLAYWRIGHT_VERSION}"; \
    rm -rf /app/node_modules/playwright /app/node_modules/playwright-core; \
    cp -a /tmp/botmode-playwright-install/node_modules/playwright /app/node_modules/playwright; \
    cp -a /tmp/botmode-playwright-install/node_modules/playwright-core /app/node_modules/playwright-core; \
    rm -rf /tmp/botmode-playwright-install; \
    node /app/node_modules/playwright/cli.js install --with-deps chromium; \
    node -e "const { chromium } = require('playwright'); const fs = require('fs'); const p = chromium.executablePath(); if (!fs.existsSync(p)) { throw new Error('Playwright Chromium missing: ' + p); } console.log('BOTMODE_PLAYWRIGHT_ISOLATED=PASS');"; \
    npm cache clean --force"""
if s.count(a) != 1:
    raise SystemExit("CI_PLAYWRIGHT_DOCKERFILE_EXPECTED_BLOCK_MISMATCH")
s = s.replace(a, b, 1)
p.write_text(s)
print("CI_PLAYWRIGHT_ISOLATED_INSTALL_PATCH=APPLIED")
