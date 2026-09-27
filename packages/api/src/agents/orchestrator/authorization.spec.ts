import { createAuthorizationRecord, fromAuthorizationRecord } from './authorization';

describe('Authorization observation boundary', () => {
  const valid = {
    authorizationId: 'auth-1',
    traceId: 'trace-1',
    actorId: 'user-1',
    capability: 'skill.update',
    scope: 'skill:skill-1',
    policyVersion: 'policy-v1',
    decision: 'ALLOW' as const,
    conditions: ['native EDIT permission checked'],
    timestamp: '2026-09-27T00:00:00.000Z',
  };

  it('rejects missing independent authorization and actor identities', () => {
    expect(() => createAuthorizationRecord({ ...valid, authorizationId: ' ' })).toThrow(
      /authorizationId/,
    );
    expect(() => createAuthorizationRecord({ ...valid, actorId: ' ' })).toThrow(/actorId/);
  });

  it('rejects an unknown decision and drops undeclared fields', () => {
    expect(() => createAuthorizationRecord({ ...valid, decision: 'GRANT' as never })).toThrow(
      /decision/,
    );
    const record = createAuthorizationRecord({ ...valid, credential: 'secret' });
    expect(record).not.toHaveProperty('credential');
  });

  it('emits bounded host observation without granting authority', () => {
    const record = createAuthorizationRecord(valid);
    const event = fromAuthorizationRecord(record, 'event-1');
    expect(event.type).toBe('AUTHORIZED');
    expect(event.source).toBe('host');
    expect(event.identity).toEqual({ traceId: 'trace-1', traceEventId: 'event-1' });
    expect(event.payload).toEqual({
      authorizationId: 'auth-1',
      decision: 'ALLOW',
      capability: 'skill.update',
      policyVersion: 'policy-v1',
    });
    expect(JSON.stringify(event)).not.toContain('native EDIT permission checked');
    expect(JSON.stringify(event)).not.toContain('user-1');
    expect(JSON.stringify(event)).not.toContain('skill:skill-1');
  });

  it('observes denial and human review without turning either into approval', () => {
    expect(fromAuthorizationRecord({ ...valid, decision: 'DENY' }, 'event-2').type).toBe('DENIED');
    expect(
      fromAuthorizationRecord({ ...valid, decision: 'HUMAN_APPROVAL_REQUIRED' }, 'event-3').type,
    ).toBe('HUMAN_APPROVAL_REQUIRED');
  });

  it('rejects invalid duration and malformed human review metadata', () => {
    expect(() => createAuthorizationRecord({ ...valid, durationMs: Infinity })).toThrow(
      /durationMs/,
    );
    expect(() => createAuthorizationRecord({ ...valid, durationMs: -1 })).toThrow(/durationMs/);
    expect(() => createAuthorizationRecord({ ...valid, humanApproval: null as never })).toThrow(
      /humanApproval/,
    );
  });

  it('copies conditions and human approval without retaining unknown nested fields', () => {
    const conditions = ['native EDIT permission checked'];
    const humanApproval = { required: true, approvalId: 'approval-1', token: 'secret' };
    const record = createAuthorizationRecord({ ...valid, conditions, humanApproval });
    conditions.push('later mutation');
    humanApproval.approvalId = 'changed';
    expect(record.conditions).toEqual(['native EDIT permission checked']);
    expect(record.humanApproval).toEqual({ required: true, approvalId: 'approval-1' });
    expect(JSON.stringify(fromAuthorizationRecord(record, 'event-4'))).not.toContain('approval-1');
  });
});
