import { defineConfig } from '@playwright/test';
import mockConfig from './playwright.config.mock';

// Reuse the established authenticated real-server/mock-model harness, but
// keep this durable Oracle qualification outside ordinary memory shards.
export default defineConfig({
  ...mockConfig,
  testDir: 'specs/qualification',
  workers: 1,
  retries: 0,
});
