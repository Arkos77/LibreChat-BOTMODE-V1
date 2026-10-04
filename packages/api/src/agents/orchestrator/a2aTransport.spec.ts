import { a2aCarriesAuthorization, createA2aTaskRequest, type A2aTaskResult } from './a2a';
import { A2aHttpTransport, createA2aCancelFromTask } from './a2aTransport';

describe('A2A HTTP transport', () => {
  const now = new Date('2026-10-04T00:00:00.000Z');
  const request = createA2aTaskRequest({
    messageId: 'm-1',
    idempotencyKey: 'idem-1',
    correlationId: 'corr-1',
    taskId: 'task-1',
    senderAgentId: 'agent-a',
    receiverAgentId: 'agent-b',
    kind: 'TASK_REQUEST',
    createdAt: now.toISOString(),
    expiresAt: '2099-01-01T00:00:00.000Z',
    objective: 'Run bounded research',
    requiredCapabilities: ['research'],
    constraints: ['budget<=5'],
  });

  it('sends a validated request with correlation and idempotency headers', async () => {
    let captured: { input: string | URL; init?: RequestInit } | undefined;
    const result: A2aTaskResult = {
      ...request,
      messageId: 'result-1',
      kind: 'TASK_RESULT',
      status: 'SUCCEEDED',
      output: { ok: true },
      artifactRefs: [],
    };
    const transport = new A2aHttpTransport({
      endpoint: 'https://agent.example/a2a',
      now: () => now,
      fetchImpl: async (input, init) => {
        captured = { input, init };
        return { status: 200, json: async () => result };
      },
    });

    await expect(transport.send(request)).resolves.toMatchObject({ status: 'SUCCEEDED', output: { ok: true } });
    expect(String(captured?.input)).toBe('https://agent.example/a2a');
    expect(captured?.init?.method).toBe('POST');
    expect(captured?.init?.headers).toEqual(expect.objectContaining({
      'a2a-message-id': 'm-1',
      'a2a-idempotency-key': 'idem-1',
      'a2a-correlation-id': 'corr-1',
    }));
    expect(a2aCarriesAuthorization(request)).toBe(false);
  });

  it('fails closed on expired request and non-success HTTP response', async () => {
    const expired = { ...request, createdAt: '2026-10-03T23:00:00.000Z', expiresAt: '2026-10-03T23:59:59.000Z' };
    const transport = new A2aHttpTransport({
      endpoint: 'https://agent.example/a2a',
      now: () => now,
      fetchImpl: async () => ({ status: 500, json: async () => ({}) }),
    });

    await expect(transport.send(expired)).rejects.toThrow(/expired/);
    await expect(transport.send(request)).rejects.toThrow(/HTTP 500/);
  });

  it('rejects malformed remote result envelopes', async () => {
    const transport = new A2aHttpTransport({
      endpoint: 'https://agent.example/a2a',
      now: () => now,
      fetchImpl: async () => ({
        status: 200,
        json: async () => ({ kind: 'TASK_RESULT', status: 'RUNNING' }),
      }),
    });
    await expect(transport.send(request)).rejects.toThrow(/messageId|correlationId|taskId/);
  });

  it('builds a correlated cancellation message without authorization', () => {
    const cancel = createA2aCancelFromTask(
      request,
      'cancelled by orchestrator',
      'cancel-1',
      '2099-01-01T00:00:00.000Z',
    );
    expect(cancel).toMatchObject({
      messageId: 'cancel-1',
      correlationId: request.correlationId,
      taskId: request.taskId,
      senderAgentId: request.senderAgentId,
      receiverAgentId: request.receiverAgentId,
      kind: 'TASK_CANCEL',
      reason: 'cancelled by orchestrator',
    });
    expect(a2aCarriesAuthorization(cancel)).toBe(false);
  });
});
