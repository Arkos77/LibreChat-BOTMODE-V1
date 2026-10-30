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
  it('permits two durable completed children even though their start rows remain running', async () => {
    await expect(check([
      make('research', 'running'),
      make('analysis', 'running'),
      make('research', 'completed'),
      make('analysis', 'completed'),
    ])).resolves.toBeUndefined();
  });
  it('refuses Oracle approval while the second detached child is still running', async () => {
    await expect(check([
      make('research', 'running'), make('research', 'completed'),
      make('analysis', 'running'),
    ])).rejects.toMatchObject({ code: 'NATIVE_MISSION_DETACHED_CHILD_PENDING' });
  });
  it.each(['error', 'cancelled'])('refuses %s child without final VERIFIED', async (status) => {
    await expect(check([make('research', 'running'), make('research', status)]))
      .rejects.toMatchObject({ code: 'NATIVE_MISSION_DETACHED_CHILD_FAILED' });
  });
  it('rejects unmatched or cross-attempt terminal instead of inferring settlement', async () => {
    await expect(check([
      make('research', 'running', 'first'),
      make('research', 'completed', 'second'),
    ])).rejects.toMatchObject({ code: 'NATIVE_MISSION_DETACHED_CHILD_PENDING' });
  });
  it('fails closed on uncertain or bounded Mongo reads', async () => {
    await expect(check(null)).rejects.toMatchObject({
      code: 'NATIVE_MISSION_DETACHED_CHILD_PROOF_INCOMPLETE',
    });
    await expect(check(Array.from({ length: 257 }, () => make('research', 'running'))))
      .rejects.toMatchObject({ code: 'NATIVE_MISSION_DETACHED_CHILD_PROOF_INCOMPLETE' });
    await expect(check([{
      ...make('research', 'completed'),
      subagentTask: { status: 'completed', attemptKey: 'first', parentRunId: 'other-parent' },
    }])).rejects.toMatchObject({ code: 'NATIVE_MISSION_DETACHED_CHILD_LINEAGE_UNCERTAIN' });
  });
  it('does not turn Mongo outages into permission to publish', async () => {
    await expect(check([], jest.fn().mockRejectedValue(new Error('Mongo unavailable'))))
      .rejects.toThrow('Mongo unavailable');
  });
});
