import type { MemoryMethods, IMemoryEntryLean } from '@librechat/data-schemas';
import {
  consolidateMemories,
  recallMemories,
  reflectMemories,
  type MemoryConsolidationResult,
  type MemoryLifecycleEntry,
  type MemoryRecallQuery,
  type MemoryRecallResult,
  type MemoryReflection,
} from './memoryLifecycle';

export function toMemoryLifecycleEntry(entry: IMemoryEntryLean): MemoryLifecycleEntry {
  return {
    id: String(entry._id),
    key: entry.key,
    value: entry.value,
    ...(entry.updated_at ? { updatedAt: entry.updated_at.toISOString() } : {}),
  };
}

export async function recallPersistedMemories({
  userId,
  agentId,
  projectId,
  query,
  getUserMemories,
}: {
  userId: string;
  agentId?: string;
  projectId?: string;
  query: MemoryRecallQuery;
  getUserMemories: MemoryMethods['getUserMemories'];
}): Promise<MemoryRecallResult[]> {
  const entries = await getUserMemories({ userId, agentId, projectId });
  return recallMemories(entries.map(toMemoryLifecycleEntry), query);
}

export async function reflectPersistedMemories({
  userId,
  agentId,
  projectId,
  getUserMemories,
}: {
  userId: string;
  agentId?: string;
  projectId?: string;
  getUserMemories: MemoryMethods['getUserMemories'];
}): Promise<MemoryReflection[]> {
  const entries = await getUserMemories({ userId, agentId, projectId });
  return reflectMemories(entries.map(toMemoryLifecycleEntry));
}

export async function consolidatePersistedMemories({
  userId,
  agentId,
  projectId,
  getUserMemories,
}: {
  userId: string;
  agentId?: string;
  projectId?: string;
  getUserMemories: MemoryMethods['getUserMemories'];
}): Promise<MemoryConsolidationResult> {
  const entries = await getUserMemories({ userId, agentId, projectId });
  return consolidateMemories(entries.map(toMemoryLifecycleEntry));
}
