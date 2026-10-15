import path from 'node:path';
import { defineConfig } from '@playwright/test';
import mockConfig from './playwright.config.mock';

// Replace only the API web server with a CI-only restart controller.
// Mongo remains in the controller process, Redis in the Actions service.
const webServer = Array.isArray(mockConfig.webServer) ? [...mockConfig.webServer] : [];
const apiServer = webServer[webServer.length - 1];
if (!apiServer) throw new Error('Missing API webServer fixture');

export default defineConfig({
  ...mockConfig,
  testDir: 'specs/qualification',
  testMatch: 'mission-oracle-runtime.spec.ts',
  grep: /worker -> specialist -> verified durable Oracle/,
  workers: 1,
  retries: 0,
  webServer: [
    ...webServer.slice(0, -1),
    {
      ...apiServer,
      command: `node ${path.resolve(__dirname, 'setup/start-server-restartable.js')}`,
      timeout: 180_000,
    },
  ],
});
