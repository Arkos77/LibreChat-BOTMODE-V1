import type { IntelBaseHost } from './intelbase';
import { lookupIntelBaseEmail } from './intelbase';

const validEmail = 'example@example.test';
const validGrant = {
  authorizationId: 'authorization-1',
  budgetReservationId: 'reservation-1',
  adultTargetConfirmed: true as const,
};

function host(overrides: Partial<IntelBaseHost> = {}): IntelBaseHost {
  return {
    userId: 'owner-1',
    tenantId: 'tenant-1',
    agentId: 'agent-1',
    taskId: 'task-1',
    purpose: 'authorized-investigation',
    authorize: jest.fn(async () => validGrant),
    getApiKey: jest.fn(async () => 'secret-key'),
    fetch: jest.fn(async (_url: string, _init: RequestInit) => new Response('')),
    ...overrides,
  };
}

describe('IntelBase egress gate', () => {
  it.each(['', 'not-an-email', 'a@b', 'a@b.test\nX-Injected: 1'])(
    'rejects invalid email %j before the host grant',
    async (email) => {
      const ctx = host();
      await expect(lookupIntelBaseEmail({ email }, ctx)).rejects.toMatchObject({
        code: 'invalid_request',
      });
      expect(ctx.authorize).not.toHaveBeenCalled();
      expect(ctx.getApiKey).not.toHaveBeenCalled();
      expect(ctx.fetch).not.toHaveBeenCalled();
    },
  );

  it('rejects additional caller-controlled fields before the host grant', async () => {
    const ctx = host();
    await expect(
      lookupIntelBaseEmail(Object.assign({ email: validEmail }, { query: 'all data' }), ctx),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    expect(ctx.authorize).not.toHaveBeenCalled();
    expect(ctx.fetch).not.toHaveBeenCalled();
  });

  it.each(['userId', 'agentId', 'purpose'])('requires %s before transport', async (field) => {
    const ctx = host({ [field]: '' });
    await expect(lookupIntelBaseEmail({ email: validEmail }, ctx)).rejects.toMatchObject({
      code: 'unauthorized',
    });
    expect(ctx.authorize).not.toHaveBeenCalled();
    expect(ctx.getApiKey).not.toHaveBeenCalled();
    expect(ctx.fetch).not.toHaveBeenCalled();
  });

  it('requires a host authorization callback and a complete grant', async () => {
    for (const authorize of [
      undefined,
      jest.fn(async () => {
        throw new Error(validEmail);
      }),
      jest.fn(async () => ({ ...validGrant, budgetReservationId: '' })),
    ]) {
      const ctx = host({ authorize: authorize as IntelBaseHost['authorize'] });
      let failure: Error | undefined;
      try {
        await lookupIntelBaseEmail({ email: validEmail }, ctx);
      } catch (error) {
        failure = error as Error;
      }
      expect(failure).toMatchObject({ code: 'unauthorized' });
      expect(failure?.message).not.toContain(validEmail);
      expect(ctx.getApiKey).not.toHaveBeenCalled();
      expect(ctx.fetch).not.toHaveBeenCalled();
    }
  });

  it('rejects a missing credential without revealing the email', async () => {
    const ctx = host({ getApiKey: jest.fn(async () => '') });
    let failure: Error | undefined;
    try {
      await lookupIntelBaseEmail({ email: validEmail }, ctx);
    } catch (error) {
      failure = error as Error;
    }
    expect(failure).toMatchObject({ code: 'credential_missing' });
    expect(failure?.message).not.toContain(validEmail);
    expect(ctx.fetch).not.toHaveBeenCalled();
  });
});

describe('IntelBase bounded transport', () => {
  it('sends one minimal documented request and returns an unverified projection', async () => {
    const providerData = {
      identifier: {
        accounts: [
          { module: { name: 'google' }, data: { password: 'hunter2', ip_address: '203.0.113.7' } },
          { module: { name: 'github' }, data: { email: validEmail, hash: 'secret-hash' } },
          { module: { name: '<script>' }, data: { login: 'private-login' } },
        ],
      },
      data_breaches: { results: [{ password: 'breach-secret' }] },
      stealer_logs: { results: [{ password: 'stealer-secret' }] },
      meta: { email: validEmail },
    };
    const transport = jest.fn(
      async (_url: string, _init: RequestInit) => new Response(JSON.stringify(providerData)),
    );
    const ctx = host({ fetch: transport });
    const observation = await lookupIntelBaseEmail({ email: validEmail }, ctx);
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, init] = transport.mock.calls[0];
    expect(url).toBe('https://api.intelbase.is/lookup/email');
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'x-api-key': 'secret-key', 'Content-Type': 'application/json' },
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      email: validEmail,
      timeout_ms: 10000,
      include_data_breaches: false,
    });
    expect(observation).toMatchObject({
      provider: 'intelbase',
      category: 'email_account_signal',
      status: 'unverified',
      accountCount: 3,
      modules: ['google', 'github'],
    });
    expect(Number.isNaN(Date.parse(observation.retrievedAt))).toBe(false);
    const serialized = JSON.stringify(observation);
    for (const secret of [
      validEmail,
      'hunter2',
      '203.0.113.7',
      'secret-hash',
      'private-login',
      'breach-secret',
      'stealer-secret',
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it.each([
    [400, 'provider_bad_request'],
    [401, 'provider_unauthorized'],
    [403, 'provider_forbidden'],
    [429, 'provider_rate_limited'],
    [500, 'provider_unavailable'],
  ])('maps HTTP %i without echoing the body or retrying', async (status, code) => {
    const transport = jest.fn(
      async () => new Response(JSON.stringify({ error: validEmail }), { status }),
    );
    const ctx = host({ fetch: transport });
    let failure: Error | undefined;
    try {
      await lookupIntelBaseEmail({ email: validEmail }, ctx);
    } catch (error) {
      failure = error as Error;
    }
    expect(failure).toMatchObject({ code });
    expect(failure?.message).not.toContain(validEmail);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('bounds and rejects malformed provider bodies', async () => {
    for (const response of [
      new Response('{broken'),
      new Response('x'.repeat(262145)),
      new Response(
        JSON.stringify({ identifier: { accounts: 'not-an-array' }, password: validEmail }),
      ),
    ]) {
      const transport = jest.fn(async (_url: string, _init: RequestInit) => response);
      const ctx = host({ fetch: transport });
      await expect(lookupIntelBaseEmail({ email: validEmail }, ctx)).rejects.toMatchObject({
        code: 'provider_invalid_response',
      });
      expect(transport).toHaveBeenCalledTimes(1);
    }
  });

  it('maps an aborted transport to a timeout without retry', async () => {
    const transport = jest.fn(async () => {
      throw new DOMException('secret', 'AbortError');
    });
    const ctx = host({ fetch: transport });
    await expect(lookupIntelBaseEmail({ email: validEmail }, ctx)).rejects.toMatchObject({
      code: 'provider_timeout',
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });
});

describe('IntelBase edge conditions', () => {
  it('refuses a grant without adult-target confirmation before key resolution', async () => {
    const ctx = host({
      authorize: jest.fn(async () => ({ ...validGrant, adultTargetConfirmed: false as never })),
    });
    await expect(lookupIntelBaseEmail({ email: validEmail }, ctx)).rejects.toMatchObject({
      code: 'unauthorized',
    });
    expect(ctx.getApiKey).not.toHaveBeenCalled();
    expect(ctx.fetch).not.toHaveBeenCalled();
  });

  it('returns an empty unverified account signal without inventing matches', async () => {
    const ctx = host({
      fetch: jest.fn(async () => new Response(JSON.stringify({ identifier: { accounts: [] } }))),
    });
    await expect(lookupIntelBaseEmail({ email: validEmail }, ctx)).resolves.toMatchObject({
      status: 'unverified',
      accountCount: 0,
      modules: [],
    });
  });
});
