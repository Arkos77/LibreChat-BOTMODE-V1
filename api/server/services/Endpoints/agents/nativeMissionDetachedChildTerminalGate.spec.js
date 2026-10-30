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
const rejectsWith = async (rows, code) => {
  await expect(check(rows)).rejects.toMatchObject({ code });
};

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

  it('refuses Oracle approval while the second detached child is running', async () => {
    const rows = [
      make('research', 'running'),
      make('research', 'completed'),
      make('analysis', 'running'),
    ];
    await rejectsWith(rows, 'NATIVE_MISSION_DETACHED_CHILD_PENDING');
  });

  it.each(['error', 'cancelled'])('refuses a child with status %s', async (status) => {
    const rows = [make('research', 'running'), make('research', status)];
    await rejectsWith(rows, 'NATIVE_MISSION_DETACHED_CHILD_FAILED');
  });

  it('refuses an unrelated attempt instead of assuming completion', async () => {
    const rows = [make('research', 'running', 'first'), make('research', 'completed', 'second')];
    await rejectsWith(rows, 'NATIVE_MISSION_DETACHED_CHILD_PENDING');
  });

  it('fails closed on missing, saturated or inconsistent Mongo receipts', async () => {
    await rejectsWith(null, 'NATIVE_MISSION_DETACHED_CHILD_PROOF_INCOMPLETE');
    const saturated = Array.from({ length: 257 }, () => make('research', 'running'));
    await rejectsWith(saturated, 'NATIVE_MISSION_DETACHED_CHILD_PROOF_INCOMPLETE');
    const row = make('research', 'completed');
    row.subagentTask.parentRunId = 'other-parent';
    await rejectsWith([row], 'NATIVE_MISSION_DETACHED_CHILD_LINEAGE_UNCERTAIN');
  });

  it('does not turn Mongo outages into permission to publish', async () => {
    const getMessages = jest.fn().mockRejectedValue(new Error('Mongo unavailable'));
    await expect(check([], getMessages)).rejects.toThrow('Mongo unavailable');
  });
});
