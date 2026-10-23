import { createMissionEvidenceContext } from './evidenceContext';

it('keeps source capture task scoped, isolated and clears stale scopes on reconfiguration', () => {
  const first = createMissionEvidenceContext(),
    second = createMissionEvidenceContext();
  first.configure({
    traceId: 'trace',
    declarations: [],
    sourceTasks: [{ nodeId: 'node', taskId: 'task', producerAgentId: 'agent' }],
  });
  expect(first.resolve('node')).toEqual({
    traceId: 'trace',
    taskId: 'task',
    producerAgentId: 'agent',
    declarations: [],
    collectSources: true,
  });
  expect(first.resolve('other')).toBeUndefined();
  expect(second.resolve('node')).toBeUndefined();
  first.configure({ traceId: 'next', declarations: [] });
  expect(first.resolve('node')).toBeUndefined();
});

it('preserves legacy criterion declarations and refuses mixed task identities atomically', () => {
  const context = createMissionEvidenceContext();
  context.configure({
    traceId: 'trace',
    declarations: [
      {
        nodeId: 'node',
        taskId: 'task',
        producerAgentId: 'agent',
        toolName: 'check',
        criterionId: 'ok',
        expectedValue: true,
      },
    ],
  });
  expect(context.resolve('node')?.declarations).toEqual([
    { toolName: 'check', criterionId: 'ok', expectedValue: true },
  ]);
  expect(() =>
    context.configure({
      traceId: 'bad',
      declarations: [
        {
          nodeId: 'node',
          taskId: 'task',
          producerAgentId: 'agent',
          toolName: 'check',
          criterionId: 'ok',
          expectedValue: true,
        },
      ],
      sourceTasks: [{ nodeId: 'node', taskId: 'foreign', producerAgentId: 'other' }],
    }),
  ).toThrow(/identity/);
  expect(context.resolve('node')?.taskId).toBe('task');
});
