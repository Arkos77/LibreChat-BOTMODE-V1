import { getConfig } from '@langchain/langgraph';
jest.mock('@langchain/langgraph', () => ({
  ...jest.requireActual('@langchain/langgraph'),
  getConfig: jest.fn(),
}));
import {
  getDetachedSubagentModelCheckpointReference,
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

  it('exposes recovery-only identity only inside an authenticated original task', async () => {
    expect(getDetachedSubagentExecutionScope()).toBeUndefined();
    await runWithDetachedSubagentUsage(
      [],
      async () => {
        const scope = getDetachedSubagentExecutionScope();
        expect(scope).toEqual({ ...seed, taskId: 'original-task', recoveryOnly: true });
        expect(Object.isFrozen(scope)).toBe(true);
      },
      'original-task',
      { ...seed, recoveryOnly: true },
    );
    expect(getDetachedSubagentExecutionScope()).toBeUndefined();
  });

  it('rejects a false recovery marker, rather than implicitly granting dispatch', () => {
    expect(() =>
      runWithDetachedSubagentUsage([], async () => undefined, 'original-task', {
        ...seed,
        recoveryOnly: false as true,
      }),
    ).toThrow('NATIVE_DETACHED_PROVIDER_SCOPE_INVALID');
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

describe('actual LangGraph model-step checkpoint provenance', () => {
  const graphConfig = getConfig as jest.MockedFunction<typeof getConfig>;
  const seed = {
    userId: 'owner',
    tenantId: 'tenant',
    parentConversationId: 'parent',
    parentRunId: 'response',
    parentToolCallId: 'original-tool',
    childThreadId: 'child-conversation',
    attemptKey: 'original-attempt',
    agentId: 'analysis',
  };
  afterEach(() => graphConfig.mockReset());

  it('reads the real SDK child graph checkpoint coordinates without inventing a key', async () => {
    const checkpoint = {
      configurable: {
        thread_id:
          'subagent:' +
          Buffer.from(
            JSON.stringify([
              seed.parentConversationId,
              'persisted-parent-fork'.repeat(9),
              'worker',
              seed.parentToolCallId,
              'persisted-tool-batch'.repeat(8),
              'durable-resume-attempt',
            ]),
          ).toString('base64url'),
        checkpoint_id: 'saved-checkpoint-id',
        checkpoint_ns: '',
        __librechat_checkpoint_ns: 'generation',
        __librechat_mission_sync: true,
      },
    };
    graphConfig.mockReturnValue(checkpoint);
    expect(checkpoint.configurable.thread_id.length).toBeGreaterThan(256);
    expect(getDetachedSubagentModelCheckpointReference()).toBeUndefined();
    await runWithDetachedSubagentUsage(
      [],
      async () => {
        expect(getDetachedSubagentModelCheckpointReference()).toEqual({
          threadId: checkpoint.configurable.thread_id,
          checkpointId: checkpoint.configurable.checkpoint_id,
          checkpointNs: '',
          generationNamespace: 'generation',
        });
      },
      'task',
      seed,
    );
  });

  it('denies a missing, unscoped or nonchild LangGraph checkpoint', async () => {
    await runWithDetachedSubagentUsage(
      [],
      async () => {
        for (const invalid of [
          {
            thread_id:
              'subagent:' +
              Buffer.from(
                JSON.stringify([
                  'foreign-parent',
                  'fork',
                  'worker',
                  seed.parentToolCallId,
                  'batch',
                ]),
              ).toString('base64url'),
            checkpoint_id: 'saved',
            checkpoint_ns: '',
            __librechat_checkpoint_ns: 'generation',
            __librechat_mission_sync: true,
          },
          {
            thread_id:
              'subagent:' +
              Buffer.from(
                JSON.stringify([
                  seed.parentConversationId,
                  'fork',
                  'worker',
                  'foreign-tool',
                  'batch',
                ]),
              ).toString('base64url'),
            checkpoint_id: 'saved',
            checkpoint_ns: '',
            __librechat_checkpoint_ns: 'generation',
            __librechat_mission_sync: true,
          },
          {
            thread_id: 'parent',
            checkpoint_id: 'saved',
            checkpoint_ns: '',
            __librechat_checkpoint_ns: 'generation',
            __librechat_mission_sync: true,
          },
          {
            thread_id: 'subagent:original',
            checkpoint_ns: '',
            __librechat_checkpoint_ns: 'generation',
            __librechat_mission_sync: true,
          },
          {
            thread_id: 'subagent:original',
            checkpoint_id: 'saved',
            checkpoint_ns: '',
            __librechat_mission_sync: true,
          },
          {
            thread_id: 'subagent:original',
            checkpoint_id: 'saved',
            checkpoint_ns: '',
            __librechat_checkpoint_ns: 'generation',
            __librechat_mission_sync: false,
          },
        ]) {
          graphConfig.mockReturnValue({ configurable: invalid });
          expect(getDetachedSubagentModelCheckpointReference()).toBeUndefined();
        }
        graphConfig.mockImplementation(() => {
          throw new Error('no-graph-context');
        });
        expect(getDetachedSubagentModelCheckpointReference()).toBeUndefined();
      },
      'task',
      seed,
    );
  });
});
