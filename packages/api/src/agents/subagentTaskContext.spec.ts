import {
  getDetachedSubagentTaskId,
  getDetachedSubagentExecutionScope,
  getDetachedSubagentProducerAgentId,
  setDetachedSubagentProducerAgentId,
  runWithDetachedSubagentUsage,
} from './subagentTaskContext';

describe('detached native task identity context', () => {
  it('binds the native producer only inside the owning detached task', async () => {
    expect(getDetachedSubagentProducerAgentId()).toBeUndefined();
    await runWithDetachedSubagentUsage(
      [],
      async () => {
        expect(getDetachedSubagentProducerAgentId()).toBeUndefined();
        setDetachedSubagentProducerAgentId('agent-native-child');
        expect(getDetachedSubagentProducerAgentId()).toBe('agent-native-child');
      },
      'task-native',
    );
    expect(getDetachedSubagentProducerAgentId()).toBeUndefined();
  });

  it('isolates concurrent sibling native task IDs and clears the context', async () => {
    let releaseA!: () => void;
    let releaseB!: () => void;
    const barrierA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    const barrierB = new Promise<void>((resolve) => {
      releaseB = resolve;
    });
    const first = runWithDetachedSubagentUsage(
      [],
      async () => {
        await barrierA;
        expect(getDetachedSubagentTaskId()).toBe('native-a');
        releaseB();
        return getDetachedSubagentTaskId();
      },
      'native-a',
    );
    const second = runWithDetachedSubagentUsage(
      [],
      async () => {
        releaseA();
        await barrierB;
        expect(getDetachedSubagentTaskId()).toBe('native-b');
        return getDetachedSubagentTaskId();
      },
      'native-b',
    );
    expect(await Promise.all([first, second])).toEqual(['native-a', 'native-b']);
    expect(getDetachedSubagentTaskId()).toBeUndefined();
  });
});

describe('durable native child model provenance, without dispatch permission', () => {
  const seed = {
    userId: 'ci-owner',
    tenantId: 'ci-tenant',
    parentConversationId: 'parent-conversation',
    parentRunId: 'parent-response',
    parentToolCallId: 'tool-call-1',
    childThreadId: 'child-conversation',
    attemptKey: 'original-attempt',
    agentId: 'saved-agent',
  };

  it('exposes the original immutable identity only inside the detached child', async () => {
    expect(getDetachedSubagentExecutionScope()).toBeUndefined();
    await runWithDetachedSubagentUsage(
      [],
      async () => {
        const captured = getDetachedSubagentExecutionScope();
        expect(captured).toEqual({ ...seed, taskId: 'native-task-1' });
        expect(Object.isFrozen(captured)).toBe(true);
        expect(captured?.attemptKey).toBe('original-attempt');
        expect(getDetachedSubagentTaskId()).toBe('native-task-1');
      },
      'native-task-1',
      seed,
    );
    expect(getDetachedSubagentExecutionScope()).toBeUndefined();
  });

  it('isolates two concurrent native child identities without overwriting either', async () => {
    const result = await Promise.all(
      ['first', 'second'].map((name) =>
        runWithDetachedSubagentUsage(
          [],
          async () => {
            await Promise.resolve();
            return getDetachedSubagentExecutionScope();
          },
          name,
          { ...seed, childThreadId: 'thread-' + name, attemptKey: 'attempt-' + name },
        ),
      ),
    );
    expect(result.map((item) => item?.taskId)).toEqual(['first', 'second']);
    expect(result.map((item) => item?.attemptKey)).toEqual(['attempt-first', 'attempt-second']);
    expect(getDetachedSubagentExecutionScope()).toBeUndefined();
  });

  it('refuses missing original lineage instead of inventing an operation identity', async () => {
    expect(() =>
      runWithDetachedSubagentUsage([], async () => undefined, 'task', {
        ...seed,
        parentToolCallId: '',
      }),
    ).toThrow('NATIVE_DETACHED_PROVIDER_SCOPE_INVALID');
    expect(getDetachedSubagentExecutionScope()).toBeUndefined();
  });

  it('does not elevate ordinary usage contexts into provider authority', async () => {
    await runWithDetachedSubagentUsage(
      [],
      async () => expect(getDetachedSubagentExecutionScope()).toBeUndefined(),
      'ordinary-task',
    );
  });
});
