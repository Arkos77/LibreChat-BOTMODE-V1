import { Types } from 'mongoose';
import {
  consolidatePersistedMemories,
  recallPersistedMemories,
  reflectPersistedMemories,
  toMemoryLifecycleEntry,
} from './memoryLifecycleAdapter';
import type { IMemoryEntryLean, MemoryMethods } from '@librechat/data-schemas';

const row = (id: string, key: string, value: string): IMemoryEntryLean => ({
  _id: new Types.ObjectId(id),
  userId: new Types.ObjectId('507f1f77bcf86cd799439011'),
  key,
  value,
  updated_at: new Date('2026-10-03T10:00:00.000Z'),
});

describe('memory lifecycle adapter', () => {
  const getUserMemories: jest.MockedFunction<MemoryMethods['getUserMemories']> = jest.fn();

  beforeEach(() => {
    getUserMemories.mockReset();
  });

  it('maps persisted rows without changing partition identity', () => {
    const mapped = toMemoryLifecycleEntry(row('507f1f77bcf86cd799439012', 'project', 'Paris'));
    expect(mapped).toEqual({
      id: '507f1f77bcf86cd799439012',
      key: 'project',
      value: 'Paris',
      updatedAt: '2026-10-03T10:00:00.000Z',
    });
  });

  it('recalls only through the existing persisted-memory reader', async () => {
    getUserMemories.mockResolvedValue([
      row('507f1f77bcf86cd799439012', 'project', 'Paris launch'),
      row('507f1f77bcf86cd799439013', 'project', 'Berlin launch'),
    ]);
    const result = await recallPersistedMemories({
      userId: 'user-1',
      agentId: 'agent-1',
      projectId: 'project-1',
      query: { query: 'Paris launch' },
      getUserMemories,
    });
    expect(result[0].entry.value).toBe('Paris launch');
    expect(getUserMemories).toHaveBeenCalledWith({
      userId: 'user-1',
      agentId: 'agent-1',
      projectId: 'project-1',
    });
  });

  it('reflects and consolidates persisted rows without writing them', async () => {
    getUserMemories.mockResolvedValue([
      row('507f1f77bcf86cd799439012', 'plan', 'draft'),
      { ...row('507f1f77bcf86cd799439013', 'plan', 'final'), updated_at: new Date('2026-10-04T10:00:00.000Z') },
    ]);
    const reflection = await reflectPersistedMemories({
      userId: 'user-1',
      getUserMemories,
    });
    const consolidation = await consolidatePersistedMemories({
      userId: 'user-1',
      getUserMemories,
    });
    expect(reflection[0].statement).toBe('plan: final');
    expect(consolidation.retained[0].value).toBe('final');
    expect(getUserMemories).toHaveBeenCalledTimes(2);
  });
});
