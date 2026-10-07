import type { Browser } from 'playwright';
import { canExecuteBrowserGrant, type BrowserExecutionGrant } from './browserSecurity';

export interface BrowserActionInput {
  url?: string;
  selector?: string;
  text?: string;
  value?: string;
  amount?: number;
  timeoutMs?: number;
}

export interface BrowserExecutionResult {
  action: BrowserExecutionGrant['action'];
  url: string;
  title: string;
  text?: string;
}

const requireText = (name: string, value: string | undefined): string => {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} must be non-empty`);
  return value.trim();
};

function assertDestination(grant: BrowserExecutionGrant, url: string): void {
  const parsed = new URL(url);
  if (grant.networkMode === 'NONE') throw new Error('Browser network mode NONE forbids navigation');
  if (grant.networkMode === 'LOCAL_LAB' && !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) {
    throw new Error('LOCAL_LAB permits only local targets');
  }
  if (grant.networkMode === 'ALLOWLIST' || grant.networkMode === 'TOR_ALLOWLIST') {
    const allowed = grant.allowlistedDestinations ?? [];
    if (!allowed.some((destination) => {
      const target = new URL(destination);
      return target.protocol === parsed.protocol && target.host === parsed.host;
    })) {
      throw new Error('Destination is not allowlisted');
    }
  }
}

function assertInputForAction(action: BrowserExecutionGrant['action'], input: BrowserActionInput): void {
  if (action === 'OPEN') requireText('url', input.url);
  if (['CLICK', 'SELECT', 'TYPE'].includes(action)) requireText('selector', input.selector);
  if (action === 'TYPE') requireText('text', input.text);
  if (action === 'SELECT') requireText('value', input.value);
}

async function executeOnPage(
  page: Awaited<ReturnType<Browser['newPage']>>,
  grant: BrowserExecutionGrant,
  input: BrowserActionInput,
): Promise<BrowserExecutionResult> {
  if (grant.action === 'OPEN') {
    const url = requireText('url', input.url);
    assertDestination(grant, url);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
  } else if (grant.action === 'CLICK') {
    await page.locator(requireText('selector', input.selector)).click();
  } else if (grant.action === 'TYPE') {
    await page.locator(requireText('selector', input.selector)).fill(requireText('text', input.text));
  } else if (grant.action === 'SELECT') {
    await page.locator(requireText('selector', input.selector)).selectOption(requireText('value', input.value));
  } else if (grant.action === 'SCROLL') {
    await page.mouse.wheel(0, Math.max(-10_000, Math.min(input.amount ?? 600, 10_000)));
  } else if (grant.action === 'BACK') {
    await page.goBack({ waitUntil: 'domcontentloaded' });
  } else if (grant.action === 'WAIT') {
    await page.waitForTimeout(Math.max(0, Math.min(input.amount ?? 500, 10_000)));
  } else if (grant.action !== 'STOP') {
    throw new Error('Unsupported browser action');
  }

  const timeout = Math.max(100, Math.min(input.timeoutMs ?? 15_000, 30_000));
  return {
    action: grant.action,
    url: page.url(),
    title: await page.title(),
    text: await page.locator('body').innerText({ timeout }),
  };
}

async function launchBrowser(): Promise<Browser> {
  try {
    const { chromium } = await import('playwright');
    return await chromium.launch({ headless: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Browser runtime unavailable: ${message}`);
  }
}

export class BrowserExecutionSession {
  private context!: Awaited<ReturnType<Browser['newContext']>>;
  private page!: Awaited<ReturnType<Browser['newPage']>>;

  constructor(
    private readonly browser: Browser,
    private readonly ownsBrowser = false,
  ) {}

  async init(): Promise<this> {
    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();
    return this;
  }

  async execute(
    grant: BrowserExecutionGrant,
    input: BrowserActionInput,
    now: Date = new Date(),
  ): Promise<BrowserExecutionResult> {
    if (!canExecuteBrowserGrant(grant, now)) {
      throw new Error('Browser execution grant is inactive or expired');
    }
    assertInputForAction(grant.action, input);
    if (grant.action === 'OPEN') {
      assertDestination(grant, requireText('url', input.url));
    }
    this.page.setDefaultTimeout(Math.max(100, Math.min(input.timeoutMs ?? 15_000, 30_000)));
    return executeOnPage(this.page, grant, input);
  }

  async close(): Promise<void> {
    await this.context.close();
    if (this.ownsBrowser) await this.browser.close();
  }
}

export async function executeBrowserGrant(
  grant: BrowserExecutionGrant,
  input: BrowserActionInput,
  deps: { browser?: Browser; now?: Date } = {},
): Promise<BrowserExecutionResult> {
  const now = deps.now ?? new Date();
  if (!canExecuteBrowserGrant(grant, now)) {
    throw new Error('Browser execution grant is inactive or expired');
  }
  assertInputForAction(grant.action, input);
  if (grant.action === 'OPEN') {
    assertDestination(grant, requireText('url', input.url));
  }

  const browser = deps.browser ?? (await launchBrowser());
  const ownsBrowser = deps.browser == null;
  const session = await new BrowserExecutionSession(browser, ownsBrowser).init();
  try {
    return await session.execute(grant, input, deps.now ?? new Date());
  } finally {
    await session.close();
  }
}
