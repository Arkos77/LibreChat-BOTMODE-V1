import { defineConfig } from '@playwright/test';
import mockConfig from './playwright.config.mock';

const minutes = Number(process.env.E2E_SOAK_MINUTES || '3');
if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) {
  throw new Error('E2E_SOAK_MINUTES must be an integer from 1 to 180');
}
export default defineConfig({
  ...mockConfig,
  testDir: 'specs/qualification',
  testMatch: 'mission-oracle-runtime.spec.ts',
  grep: /durable model-only mission soak/,
  timeout: minutes * 60000 + 240000,
  workers: 1,
  retries: 0,
});
