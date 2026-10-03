import { a2aCarriesAuthorization, createA2aTaskCancel, createA2aTaskRequest, validateA2aEnvelope } from './a2a';

const base = {
  messageId: 'm1', idempotencyKey: 'idem-1', correlationId: 'corr-1', taskId: 'task-1',
  senderAgentId: 'agent-a', receiverAgentId: 'agent-b', createdAt: '2026-10-04T00:00:00.000Z',
  expiresAt: '2099-01-01T00:00:00.000Z',
};

describe('A2A contract', () => {
  it('validates a task request with explicit capability and constraints', () => {
    const request = createA2aTaskRequest({ ...base, kind: 'TASK_REQUEST', objective: 'Research target', requiredCapabilities: ['research', 'web', 'research'], constraints: ['budget<=5'] });
    expect(request.requiredCapabilities).toEqual(['research', 'web']);
    expect(request.constraints).toEqual(['budget<=5']);
  });

  it('requires distinct sender/receiver and a future expiry', () => {
    expect(() => validateA2aEnvelope({ ...base, senderAgentId: 'agent-a', receiverAgentId: 'agent-a', kind: 'TASK_STATUS' })).toThrow(/sender and receiver/);
    expect(() => validateA2aEnvelope({ ...base, expiresAt: base.createdAt, kind: 'TASK_STATUS' })).toThrow(/expiry/);
  });

  it('supports cancellation without turning a message into authority', () => {
    const cancel = createA2aTaskCancel({ ...base, kind: 'TASK_CANCEL', reason: 'deadline reached' });
    expect(cancel.reason).toBe('deadline reached');
    expect(a2aCarriesAuthorization(cancel)).toBe(false);
  });

  it('fails closed on missing capability/objective', () => {
    expect(() => createA2aTaskRequest({ ...base, kind: 'TASK_REQUEST', objective: 'x', requiredCapabilities: [], constraints: [] })).toThrow(/capabilities/);
    expect(() => createA2aTaskRequest({ ...base, kind: 'TASK_REQUEST', objective: ' ', requiredCapabilities: ['research'], constraints: [] })).toThrow(/objective/);
  });
});
