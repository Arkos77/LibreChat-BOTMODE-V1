import type { MemoryLifecycleEntry, MemoryReflection } from '../memoryLifecycle';

export interface MemoryObservation {
  id: string;
  kind: 'FACT' | 'EXPERIENCE' | 'OBSERVATION';
  statement: string;
  sourceIds: readonly string[];
  observedAt?: string;
  confidence?: number;
}

export interface MemoryKnowledgePage {
  id: string;
  title: string;
  scope: string;
  statements: readonly string[];
  sourceIds: readonly string[];
  updatedAt: string;
}

export function retainMemoryObservation(input: Omit<MemoryObservation, 'id'> & { id: string }): MemoryObservation {
  if (!input.id || !input.statement.trim()) throw new Error('Memory observation identity and statement are required');
  if (input.sourceIds.length === 0 || input.sourceIds.some((id) => !id.trim())) {
    throw new Error('Memory observation requires provenance');
  }
  return { ...input, sourceIds: [...input.sourceIds] };
}

export function recallMemoryKnowledge(
  observations: readonly MemoryObservation[],
  query: string,
): MemoryObservation[] {
  const terms = new Set(query.toLowerCase().split(/[^a-z0-9_-]+/).filter(Boolean));
  if (terms.size === 0) return [];
  return observations
    .filter((item) => [...terms].some((term) => item.statement.toLowerCase().includes(term)))
    .map((item) => ({ ...item, sourceIds: [...item.sourceIds] }));
}

export function reflectMemoryKnowledge(
  entries: readonly MemoryLifecycleEntry[],
  reflections: readonly MemoryReflection[],
  scope: string,
): MemoryKnowledgePage {
  if (!scope.trim()) throw new Error('Memory knowledge scope is required');
  const statements = [...reflections.map((item) => item.statement), ...entries.map((item) => item.key + ': ' + item.value)];
  return {
    id: `knowledge:${scope}`,
    title: `Knowledge ${scope}`,
    scope,
    statements: [...new Set(statements)],
    sourceIds: [...new Set([...reflections.flatMap((item) => item.sourceIds), ...entries.flatMap((item) => item.sourceIds ?? [])])],
    updatedAt: new Date().toISOString(),
  };
}
