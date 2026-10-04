import { createSecurityLabScope } from './browserSecurity';
import { SecurityLabExecutor, type SecurityLabTool } from './securityLabExecutor';

describe('security lab executor', () => {
  const scope = createSecurityLabScope({
    scopeId: 'lab-1',
    taskId: 'task-1',
    target: 'local-lab',
    allowedTools: ['probe', 'inspect'],
    networkMode: 'LOCAL_LAB',
    expiresAt: '2099-01-01T00:00:00.000Z',
    maxConcurrency: 2,
    status: 'ACTIVE',
  });

  it('executes only tools admitted by the scope', async () => {
    const tools = new Map<string, SecurityLabTool>([
      ['probe', async (input: unknown) => ({ ok: true, input })],
    ]);
    const executor = new SecurityLabExecutor(scope, tools, () => new Date('2026-10-04T00:00:00.000Z'));

    await expect(executor.execute('probe', 'target')).resolves.toEqual({
      tool: 'probe',
      output: { ok: true, input: 'target' },
    });
    await expect(executor.execute('inspect', {})).rejects.toThrow(/unavailable/);
    await expect(executor.execute('shell', {})).rejects.toThrow(/not allowed/);
  });

  it('fails closed when the scope is expired', async () => {
    const expired = createSecurityLabScope({
      ...scope,
      expiresAt: '2026-01-01T00:00:00.000Z',
    });
    const executor = new SecurityLabExecutor(expired, new Map([['probe', async () => 'ok']]), () => new Date('2026-10-04T00:00:00.000Z'));
    await expect(executor.execute('probe', {})).rejects.toThrow(/inactive or expired/);
  });

  it('enforces max concurrency while allowing non-overlapping calls', async () => {
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tools = new Map<string, SecurityLabTool>([
      ['probe', async () => {
        await blocker;
        return 'probe-ok';
      }],
      ['inspect', async () => 'inspect-ok'],
    ]);
    const limited = new SecurityLabExecutor({ ...scope, maxConcurrency: 1 }, tools, () => new Date('2026-10-04T00:00:00.000Z'));

    const first = limited.execute('probe', {});
    await expect(limited.execute('inspect', {})).rejects.toThrow(/maxConcurrency/);
    release();
    await expect(first).resolves.toMatchObject({ output: 'probe-ok' });
    await expect(limited.execute('inspect', {})).resolves.toMatchObject({ output: 'inspect-ok' });
  });
});
