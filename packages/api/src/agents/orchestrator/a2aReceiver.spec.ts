import { createA2aTaskRequest, type A2aTaskResult } from './a2a';
import { createA2aReceiver } from './a2aReceiver';

describe('A2A receiver', () => {
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
    objective: 'delegate bounded work',
    requiredCapabilities: ['research'],
    constraints: [],
  });

  const result: A2aTaskResult = {
    ...request,
    messageId: 'r-1',
    kind: 'TASK_RESULT',
    status: 'SUCCEEDED',
    output: { ok: true },
    artifactRefs: [],
  };

  it('delegates valid requests', async () => {
    const requestDispatcher = jest.fn(async () => result);
    const receiver = createA2aReceiver({ now: () => now }, {
      request: requestDispatcher,
      cancel: jest.fn(),
    });
    await expect(receiver.handle(request)).resolves.toEqual(result);
    expect(requestDispatcher).toHaveBeenCalledTimes(1);
  });

  it('deduplicates idempotent retries', async () => {
    const requestDispatcher = jest.fn(async () => result);
    const receiver = createA2aReceiver({ now: () => now }, {
      request: requestDispatcher,
      cancel: jest.fn(),
    });
    await receiver.handle(request);
    await receiver.handle({ ...request, messageId: 'different-message-id' });
    expect(requestDispatcher).toHaveBeenCalledTimes(1);
  });

  it('fails closed on expired or oversized messages', async () => {
    const receiver = createA2aReceiver({ now: () => now, maxBodyBytes: 4096 }, {
      request: jest.fn(async () => result),
      cancel: jest.fn(),
    });
    await expect(
      receiver.handle({ ...request, createdAt: '2026-10-03T23:00:00.000Z', expiresAt: '2026-10-03T23:59:59.000Z' }),
    ).rejects.toThrow(/expired/);
    await expect(receiver.handle(request, 4097)).rejects.toThrow(/too large/);
  });

  it('dispatches cancellation through the host dispatcher', async () => {
    const cancel = {
      ...request,
      messageId: 'cancel-1',
      idempotencyKey: 'idem-cancel',
      kind: 'TASK_CANCEL' as const,
      reason: 'stop requested',
    };
    const cancelDispatcher = jest.fn(async () => ({ ...result, messageId: 'cancel-result' }));
    const receiver = createA2aReceiver({ now: () => now }, {
      request: jest.fn(),
      cancel: cancelDispatcher,
    });
    await expect(receiver.handle(cancel)).resolves.toMatchObject({ kind: 'TASK_RESULT' });
    expect(cancelDispatcher).toHaveBeenCalledWith(cancel);
  });
});
