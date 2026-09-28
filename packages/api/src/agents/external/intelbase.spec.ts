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
    fetch: jest.fn() as jest.MockedFunction<typeof fetch>,
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
      lookupIntelBaseEmail({ email: validEmail, query: 'all data' }, ctx),
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
