'use strict';
const {
  assertNativeMissionDetachedChildrenTerminal: gate,
} = require('./nativeMissionDetachedChildTerminalGate');

const parent = 'ci-original-parent-response';
const make = (id, status, attempt = 'attempt-1') => ({
  messageId: id + (status === 'running' ? ':user' : ':assistant'),
  conversationId: 'ci-child-thread-' + id,
  subagentTask: { status, attemptKey: attempt, parentRunId: parent },
});
const check = (rows, getMessages = jest.fn().mockResolvedValue(rows)) =>
  gate({ getMessages, userId: 'ci-user', parentResponseMessageId: parent });

describe('native mission detached child Oracle/P6 terminal gate', () => {
  it('permits a mission with no detached child tasks', async () => {
    const getMessages = jest.fn().mockResolvedValue([]);
    await expect(check([], getMessages)).resolves.toBeUndefined();
    expect(getMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        user: 'ci-user',
        'subagentTask.parentRunId': parent,
        'subagentTask.status': { $in: ['running', 'completed', 'error', 'cancelled'] },
      }),
      expect.stringContaining('+subagentTask'),
      expect.objectContaining({ limit: 257 }),
    );
  });

  it('permits completed children while their start rows remain running', async () => {
    const rows = [
      make('research', 'running'),
      make('analysis', 'running'),
      make('research', 'completed'),
      make('analysis', 'completed'),
    ];
    await expect(check(rows)).resolves.toBeUndefined();
  });

  it('rechecks a pending receipt and succeeds only after its matching terminal is durable', async () => {
    const started = [make('research', 'running')];
    const completed = [...started, make('research', 'completed')];
    const getMessages = jest
      .fn()
      .mockResolvedValueOnce(started)
      .mockResolvedValueOnce(completed);
    const sleep = jest.fn().mockResolvedValue(undefined);
    await expect(
      gate({
        getMessages,
        userId: 'ci-user',
        parentResponseMessageId: parent,
        pendingRetryCount: 2,
        pendingRetryDelayMs: 10,
        sleep,
      }),
    ).resolves.toBeUndefined();
    expect(getMessages).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(10);
  });

  it('remains fail-closed when a child has no terminal after bounded retries', async () => {
    const getMessages = jest.fn().mockResolvedValue([make('research', 'running')]);
    const sleep = jest.fn().mockResolvedValue(undefined);
    await expect(
      gate({
        getMessages,
        userId: 'ci-user',
        parentResponseMessageId: parent,
        pendingRetryCount: 2,
        sleep,
      }),
    ).rejects.toMatchObject({ code: 'NATIVE_MISSION_DETACHED_CHILD_PENDING' });
    expect(getMessages).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('never treats disappearing Mongo child receipts as permission to publish', async () => {
    const getMessages = jest
      .fn()
      .mockResolvedValueOnce([make('research', 'running')])
      .mockResolvedValueOnce([]);
    const sleep = jest.fn().mockResolvedValue(undefined);
    await expect(
      gate({
        getMessages,
        userId: 'ci-user',
        parentResponseMessageId: parent,
        pendingRetryCount: 2,
        sleep,
      }),
    ).rejects.toMatchObject({ code: 'NATIVE_MISSION_DETACHED_CHILD_PROOF_INCOMPLETE' });
    expect(getMessages).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('never retries or approves a failed child even when pending retries are allowed', async () => {
    const getMessages = jest
      .fn()
      .mockResolvedValue([make('research', 'running'), make('research', 'error')]);
    const sleep = jest.fn().mockResolvedValue(undefined);
    await expect(
      gate({
        getMessages,
        userId: 'ci-user',
        parentResponseMessageId: parent,
        pendingRetryCount: 2,
        sleep,
      }),
    ).rejects.toMatchObject({ code: 'NATIVE_MISSION_DETACHED_CHILD_FAILED' });
    expect(getMessages).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('refuses Oracle approval while the second detached child is running', async () => {
    const rows = [
      make('research', 'running'),
      make('research', 'completed'),
      make('analysis', 'running'),
    ];
    await expect(check(rows)).rejects.toMatchObject({
      code: 'NATIVE_MISSION_DETACHED_CHILD_PENDING',
    });
  });

  it.each(['error', 'cancelled'])('refuses a child with status %s', async (status) => {
    const rows = [make('research', 'running'), make('research', status)];
    await expect(check(rows)).rejects.toMatchObject({
      code: 'NATIVE_MISSION_DETACHED_CHILD_FAILED',
    });
  });

  it('refuses an unrelated attempt instead of assuming completion', async () => {
    const rows = [make('research', 'running', 'first'), make('research', 'completed', 'second')];
    await expect(check(rows)).rejects.toMatchObject({
      code: 'NATIVE_MISSION_DETACHED_CHILD_PENDING',
    });
  });

  it('fails closed on missing, saturated or inconsistent Mongo receipts', async () => {
    await expect(check(null)).rejects.toMatchObject({
      code: 'NATIVE_MISSION_DETACHED_CHILD_PROOF_INCOMPLETE',
    });
    const saturated = Array.from({ length: 257 }, () => make('research', 'running'));
    await expect(check(saturated)).rejects.toMatchObject({
      code: 'NATIVE_MISSION_DETACHED_CHILD_PROOF_INCOMPLETE',
    });
    const row = make('research', 'completed');
    row.subagentTask.parentRunId = 'other-parent';
    await expect(check([row])).rejects.toMatchObject({
      code: 'NATIVE_MISSION_DETACHED_CHILD_LINEAGE_UNCERTAIN',
    });
  });

  it('does not turn Mongo outages into permission to publish', async () => {
    const getMessages = jest.fn().mockRejectedValue(new Error('Mongo unavailable'));
    await expect(check([], getMessages)).rejects.toThrow('Mongo unavailable');
  });
});
