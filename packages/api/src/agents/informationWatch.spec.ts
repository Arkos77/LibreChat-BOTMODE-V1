import {
  INFORMATION_WATCH_SOURCES,
  InformationWatchRegistry,
  InformationWatchRunner,
} from './informationWatch';

describe('InformationWatchRunner', () => {
  const descriptor = {
    sourceId: 'reddit',
    name: 'Reddit',
    category: 'social' as const,
    access: 'SEARCH_PROVIDER' as const,
    connected: true,
    sourceUrl: 'https://www.reddit.com',
  };

  it('tracks source availability with provenance', async () => {
    const runner = new InformationWatchRunner(new InformationWatchRegistry());
    const [state] = await runner.run([
      {
        descriptor,
        check: async () => ({
          sourceId: 'reddit',
          checkedAt: '2026-10-05T12:00:00.000Z',
          status: 'ACTIVE' as const,
          sourceRef: 'search:reddit',
          evidenceRefs: ['reddit:test'],
          itemCount: 12,
        }),
      },
    ]);

    expect(state).toMatchObject({ status: 'ACTIVE', itemCount: 12, sourceRef: 'search:reddit' });
  });

  it('fails closed to unavailable instead of disabling the watch system', async () => {
    const runner = new InformationWatchRunner();
    const [state] = await runner.run([
      {
        descriptor,
        check: async () => {
          throw new Error('provider unavailable');
        },
      },
    ]);
    expect(state.status).toBe('UNAVAILABLE');
    expect(state.note).toBe('provider unavailable');
  });

  it('bounds the number of sources per pass', async () => {
    const runner = new InformationWatchRunner(new InformationWatchRegistry(), {
      maxSourcesPerPass: 1,
    });
    const adapter = {
      descriptor,
      check: async () => ({
        sourceId: 'reddit',
        checkedAt: '2026-10-05T12:00:00.000Z',
        status: 'ACTIVE' as const,
        sourceRef: 'test',
      }),
    };
    await expect(runner.run([adapter, adapter])).rejects.toThrow('watch limit');
  });
  it('keeps specialized sources explicit until a real adapter is connected', () => {
    expect(INFORMATION_WATCH_SOURCES.map((source) => source.sourceId)).toEqual([
      'reddit',
      'youtube',
      'discord',
      'instagram',
      'tgstat',
      'fmhy',
    ]);
    expect(INFORMATION_WATCH_SOURCES.every((source) => source.connected === false)).toBe(true);
  });
});
