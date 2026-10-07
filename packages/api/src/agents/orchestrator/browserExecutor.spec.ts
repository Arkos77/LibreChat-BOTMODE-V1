import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { createBrowserExecutionGrant, type BrowserExecutionGrant } from './browserSecurity';
import { BrowserExecutionSession, executeBrowserGrant } from './browserExecutor';

describe('browser executor', () => {
  const now = new Date('2026-10-04T00:00:00.000Z');

  async function withBrowser(
    fn: (browser: Awaited<ReturnType<typeof chromium.launch>>) => Promise<void>,
  ) {
    const browser = await chromium.launch({
      headless: true,
      executablePath: chromium.executablePath(),
    });
    try {
      await fn(browser);
    } finally {
      await browser.close();
    }
  }

  const browserIt = existsSync(chromium.executablePath()) ? it : it.skip;

  browserIt(
    'executes OPEN and CLICK against a real browser context',
    async () => {
      await withBrowser(async (browser) => {
        const grant: BrowserExecutionGrant = createBrowserExecutionGrant({
          grantId: 'g-open',
          taskId: 'task-open',
          action: 'OPEN',
          networkMode: 'WEB',
          status: 'ACTIVE',
          expiresAt: '2099-01-01T00:00:00.000Z',
        });
        const url =
          'data:text/html,<html><head><title>BOT MODE Lab</title></head><body><button id="go">go</button></body></html>';
        const session = await new BrowserExecutionSession(browser).init();
        try {
          const result = await session.execute(grant, { url }, now);
          expect(result.title).toBe('BOT MODE Lab');
          const click = await session.execute({ ...grant, action: 'CLICK' }, { selector: '#go' }, now);
          expect(click.url).toContain('data:text/html');
        } finally {
          await session.close();
        }
      });
    },
    30_000,
  );

  it('fails closed for expired grants and non-local LOCAL_LAB navigation', async () => {
    const expired: BrowserExecutionGrant = createBrowserExecutionGrant({
      grantId: 'g-expired',
      taskId: 'task-expired',
      action: 'OPEN',
      networkMode: 'LOCAL_LAB',
      status: 'ACTIVE',
      expiresAt: '2026-01-01T00:00:00.000Z',
    });
    await expect(
      executeBrowserGrant(expired, { url: 'http://localhost:3080' }, { now }),
    ).rejects.toThrow(/inactive or expired/);

    const grant: BrowserExecutionGrant = createBrowserExecutionGrant({
      grantId: 'g-local',
      taskId: 'task-local',
      action: 'OPEN',
      networkMode: 'LOCAL_LAB',
      status: 'ACTIVE',
      expiresAt: '2099-01-01T00:00:00.000Z',
    });
    await expect(
      executeBrowserGrant(grant, { url: 'https://example.com' }, { now }),
    ).rejects.toThrow(/LOCAL_LAB/);
  });

  it('enforces exact ALLOWLIST host matching before browser launch', async () => {
    const grant = createBrowserExecutionGrant({
      grantId: 'g-allow',
      taskId: 'task-allow',
      action: 'OPEN',
      networkMode: 'ALLOWLIST',
      status: 'ACTIVE',
      expiresAt: '2099-01-01T00:00:00.000Z',
      allowlistedDestinations: ['https://example.com'],
    });
    await expect(
      executeBrowserGrant(grant, { url: 'https://evil.example.com/path' }, { now }),
    ).rejects.toThrow(/allowlisted/);
  });
});
