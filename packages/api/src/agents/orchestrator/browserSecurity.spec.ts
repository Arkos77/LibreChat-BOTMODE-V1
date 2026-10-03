import {
  canExecuteBrowserGrant,
  canExecuteSecurityLab,
  createBrowserExecutionGrant,
  createSecurityLabScope,
} from './browserSecurity';

describe('browser and security lab governance', () => {
  const future = '2099-01-01T00:00:00.000Z';

  it('supports the bounded browser action contract', () => {
    const grant = createBrowserExecutionGrant({ grantId: 'g1', taskId: 't1', action: 'OPEN', networkMode: 'WEB', status: 'ACTIVE', expiresAt: future });
    expect(canExecuteBrowserGrant(grant, new Date('2026-10-04T00:00:00.000Z'))).toBe(true);
  });

  it('fails closed for allowlisted modes without destinations', () => {
    expect(() => createBrowserExecutionGrant({ grantId: 'g1', taskId: 't1', action: 'OPEN', networkMode: 'ALLOWLIST', status: 'ACTIVE', expiresAt: future })).toThrow(/destinations/);
    expect(() => createBrowserExecutionGrant({ grantId: 'g1', taskId: 't1', action: 'OPEN', networkMode: 'TOR_ALLOWLIST', status: 'ACTIVE', expiresAt: future })).toThrow(/destinations/);
  });

  it('treats revoked and expired grants as non-executable', () => {
    const revoked = createBrowserExecutionGrant({ grantId: 'g1', taskId: 't1', action: 'CLICK', networkMode: 'WEB', status: 'REVOKED', expiresAt: future });
    const expired = createBrowserExecutionGrant({ grantId: 'g2', taskId: 't1', action: 'CLICK', networkMode: 'WEB', status: 'ACTIVE', expiresAt: '2026-01-01T00:00:00.000Z' });
    expect(canExecuteBrowserGrant(revoked, new Date())).toBe(false);
    expect(canExecuteBrowserGrant(expired, new Date('2026-10-04T00:00:00.000Z'))).toBe(false);
  });

  it('requires bounded tools and concurrency for a security lab', () => {
    const scope = createSecurityLabScope({ scopeId: 'lab1', taskId: 't1', target: 'root-me:challenge-1', allowedTools: ['curl'], networkMode: 'LOCAL_LAB', expiresAt: future, maxConcurrency: 1, status: 'ACTIVE' });
    expect(canExecuteSecurityLab(scope, new Date('2026-10-04T00:00:00.000Z'))).toBe(true);
    expect(() => createSecurityLabScope({ ...scope, allowedTools: [] })).toThrow(/allowed tools/);
    expect(() => createSecurityLabScope({ ...scope, maxConcurrency: 0 })).toThrow(/maxConcurrency/);
  });
});
