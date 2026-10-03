import { recallMemoryKnowledge, reflectMemoryKnowledge, retainMemoryObservation } from './memoryKnowledge';

describe('memory knowledge extension', () => {
  it('retains provenance and recalls observations', () => {
    const observation = retainMemoryObservation({
      id: 'o1', kind: 'FACT', statement: 'Paris launch target', sourceIds: ['source-1'],
    });
    expect(recallMemoryKnowledge([observation], 'Paris')).toHaveLength(1);
  });

  it('creates a knowledge page from existing lifecycle evidence without replacing Durable', () => {
    const page = reflectMemoryKnowledge(
      [{ id: 'm1', key: 'plan', value: 'final', sourceIds: ['s1'] }],
      [{ statement: 'plan: final', sourceIds: ['s1'], confidence: 1 }],
      'agent-1',
    );
    expect(page.id).toBe('knowledge:agent-1');
    expect(page.sourceIds).toEqual(['s1']);
  });

  it('fails closed without provenance', () => {
    expect(() => retainMemoryObservation({ id: 'o1', kind: 'OBSERVATION', statement: 'x', sourceIds: [] })).toThrow(
      'Memory observation requires provenance',
    );
  });
});
