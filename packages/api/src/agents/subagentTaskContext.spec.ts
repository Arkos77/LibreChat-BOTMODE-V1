import {
  getDetachedSubagentTaskId,
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
