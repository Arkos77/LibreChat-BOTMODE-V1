export interface MemoryLifecycleEntry {
  id: string;
  key: string;
  value: string;
  updatedAt?: string;
  tags?: readonly string[];
  confidence?: number;
  sourceIds?: readonly string[];
}

export interface MemoryRecallQuery {
  query: string;
  limit?: number;
  requiredTags?: readonly string[];
}

export interface MemoryRecallResult {
  entry: MemoryLifecycleEntry;
  score: number;
  matchedTerms: readonly string[];
}

export interface MemoryReflection {
  statement: string;
  sourceIds: readonly string[];
  confidence: number;
}

export interface MemoryConsolidationResult {
  retained: readonly MemoryLifecycleEntry[];
  reflections: readonly MemoryReflection[];
}

const tokenize = (value: string): string[] =>
  value.toLowerCase().split(/[^a-z0-9_-]+/).filter((token) => token.length > 1);

function scoreEntry(entry: MemoryLifecycleEntry, queryTerms: Set<string>): MemoryRecallResult {
  const terms = new Set(tokenize(entry.key + ' ' + entry.value + ' ' + (entry.tags ?? []).join(' ')));
  const matchedTerms = [...queryTerms].filter((term) => terms.has(term));
  const lexicalScore = queryTerms.size === 0 ? 0 : matchedTerms.length / queryTerms.size;
  const confidence = entry.confidence == null ? 1 : Math.max(0, Math.min(1, entry.confidence));
  return {
    entry,
    score: lexicalScore * 0.8 + confidence * 0.2,
    matchedTerms,
  };
}

export function recallMemories(
  entries: readonly MemoryLifecycleEntry[],
  query: MemoryRecallQuery,
): MemoryRecallResult[] {
  const queryTerms = new Set(tokenize(query.query));
  const requiredTags = new Set(query.requiredTags ?? []);
  const limit = Math.max(1, Math.min(100, query.limit ?? 10));
  return entries
    .filter((entry) => requiredTags.size === 0 || [...requiredTags].every((tag) => entry.tags?.includes(tag)))
    .map((entry) => scoreEntry(entry, queryTerms))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.entry.id.localeCompare(right.entry.id))
    .slice(0, limit);
}

export function reflectMemories(entries: readonly MemoryLifecycleEntry[]): MemoryReflection[] {
  const byKey = new Map<string, MemoryLifecycleEntry[]>();
  for (const entry of entries) {
    const bucket = byKey.get(entry.key) ?? [];
    bucket.push(entry);
    byKey.set(entry.key, bucket);
  }
  return [...byKey.entries()]
    .filter(([, bucket]) => bucket.length >= 2)
    .map(([key, bucket]) => {
      const latest = [...bucket].sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))[0];
      const confidence = bucket.reduce((sum, entry) => sum + (entry.confidence == null ? 1 : entry.confidence), 0) / bucket.length;
      return {
        statement: key + ': ' + latest.value,
        sourceIds: bucket.flatMap((entry) => entry.sourceIds ?? [entry.id]),
        confidence: Math.max(0, Math.min(1, confidence)),
      };
    })
    .sort((a, b) => a.statement.localeCompare(b.statement));
}

export function consolidateMemories(
  entries: readonly MemoryLifecycleEntry[],
): MemoryConsolidationResult {
  const latestByKey = new Map<string, MemoryLifecycleEntry>();
  for (const entry of entries) {
    const current = latestByKey.get(entry.key);
    if (current == null || String(entry.updatedAt ?? '') > String(current.updatedAt ?? '') || (entry.updatedAt == null && current.updatedAt == null && entry.id > current.id)) {
      latestByKey.set(entry.key, entry);
    }
  }
  return {
    retained: [...latestByKey.values()].sort((a, b) => a.key.localeCompare(b.key)),
    reflections: reflectMemories(entries),
  };
}
