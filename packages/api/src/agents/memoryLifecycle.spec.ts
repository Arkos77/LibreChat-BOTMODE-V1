import type { MemoryLifecycleEntry } from './memoryLifecycle';
import { consolidateMemories, recallMemories, reflectMemories } from './memoryLifecycle';

const entry = (
  id: string,
  key: string,
  value: string,
  overrides: Partial<MemoryLifecycleEntry> = {},
) => ({
  id,
  key,
  value,
  updatedAt: '2026-10-03T10:00:00.000Z',
  confidence: 0.9,
  ...overrides,
});

describe('memory lifecycle', () => {
  it('recalls matching memories deterministically', () => {
    const entries = [entry('b', 'project', 'Paris launch'), entry('a', 'project', 'Berlin launch')];
    const result = recallMemories(entries, { query: 'Paris launch', limit: 10 });
    expect(result[0].entry.id).toBe('b');
    expect(result[0].matchedTerms).toEqual(['paris', 'launch']);
  });

  it('supports tag filtering and bounded limits', () => {
    const entries = [
      entry('a', 'one', 'alpha', { tags: ['work'] }),
      entry('b', 'two', 'alpha', { tags: ['home'] }),
      entry('c', 'three', 'alpha', { tags: ['work'] }),
    ];
    expect(
      recallMemories(entries, { query: 'alpha', requiredTags: ['work'], limit: 1 }),
    ).toHaveLength(1);
    expect(
      recallMemories(entries, { query: 'alpha', requiredTags: ['work'], limit: 1 })[0].entry.id,
    ).toBe('a');
  });

  it('reflects repeated keys with source provenance', () => {
    const entries = [
      entry('a', 'preference', 'tea', { sourceIds: ['src-a'] }),
      entry('b', 'preference', 'coffee', { sourceIds: ['src-b'] }),
    ];
    expect(reflectMemories(entries)).toEqual([
      { statement: 'preference: tea', sourceIds: ['src-a', 'src-b'], confidence: 0.9 },
    ]);
  });

  it('consolidates to the latest entry per key', () => {
    const entries = [
      entry('old', 'plan', 'draft', { updatedAt: '2026-10-01T10:00:00.000Z' }),
      entry('new', 'plan', 'final', { updatedAt: '2026-10-03T10:00:00.000Z' }),
      entry('other', 'name', 'Jarvis'),
    ];
    expect(
      consolidateMemories(entries)
        .retained.map((item) => item.id)
        .sort(),
    ).toEqual(['new', 'other']);
  });
});
