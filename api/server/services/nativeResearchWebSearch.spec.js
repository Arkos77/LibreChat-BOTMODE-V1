const { createNativeResearchBatch } = require('./nativeResearchWebSearch');

describe('host-owned native web search batch', () => {
  const topics = ['MDN Web Docs SpeechRecognition', 'MDN Web Docs SpeechSynthesis'];

  function setup({ missingSecond = false } = {}) {
    const observed = [];
    const calls = [];
    const ownerCallbacks = {
      onSearchResults: (value, config) => observed.push({ value, id: config.toolCall.id }),
      onGetHighlights: jest.fn(),
    };
    const batch = createNativeResearchBatch(ownerCallbacks, topics);
    const tool = {
      name: 'web_search',
      responseFormat: 'content_and_artifact',
      func: async (params, config) => {
        calls.push({ ...params });
        const noSource = missingSecond && params.query === topics[1];
        const link = `https://developer.mozilla.org/en-US/docs/Web/API/${params.query.split(' ').at(-1)}`;
        const organic = noSource ? [] : [{ title: params.query, link }];
        batch.callbacks.onSearchResults(
          { success: true, data: { organic, topStories: [] } },
          config,
        );
        return [
          params.query,
          { web_search: { organic, topStories: [] }, outcome: 'Retrieved' },
        ];
      },
    };
    batch.wrap([tool]);
    return { tool, observed, calls };
  }

  test('one checkpointed call executes both authorized searches and records one combined source receipt', async () => {
    const { tool, observed, calls } = setup();
    const [text, artifact] = await tool.func(
      { query: 'model-chosen-only-one-topic', date: 'd' },
      { toolCall: { id: 'real-tool-call-1', name: 'web_search' } },
    );
    expect(calls.map((call) => call.query)).toEqual(topics);
    expect(calls.every((call) => call.date === undefined)).toBe(true);
    expect(text).toContain('SpeechRecognition');
    expect(text).toContain('SpeechSynthesis');
    expect(observed).toHaveLength(1);
    expect(observed[0].id).toBe('real-tool-call-1');
    expect(observed[0].value.data.organic).toHaveLength(2);
    expect(artifact.web_search.organic).toHaveLength(2);
  });

  test('fails closed if one subject has no observed source and emits no partial evidence', async () => {
    const { tool, observed } = setup({ missingSecond: true });
    await expect(
      tool.func({ query: 'ignored' }, { toolCall: { id: 'missing-source' } }),
    ).rejects.toThrow('BOTMODE_RESEARCH_SUBJECT_SOURCES_REQUIRED');
    expect(observed).toHaveLength(0);
  });

  test('rejects unsupported or repeated host query plans', () => {
    expect(() => createNativeResearchBatch({}, ['only one'])).toThrow(
      'BOTMODE_RESEARCH_BATCH_POLICY_INVALID',
    );
    expect(() => createNativeResearchBatch({}, ['topic', 'topic'])).toThrow(
      'BOTMODE_RESEARCH_BATCH_POLICY_INVALID',
    );
    expect(() => createNativeResearchBatch({}, ['a', 'b', 'c', 'd'])).toThrow(
      'BOTMODE_RESEARCH_BATCH_POLICY_INVALID',
    );
  });

  test('preserves distinct concurrent tool call identities', async () => {
    const { tool, observed } = setup();
    await Promise.all([
      tool.func({}, { toolCall: { id: 'outer-A' } }),
      tool.func({}, { toolCall: { id: 'outer-B' } }),
    ]);
    expect(observed.map((item) => item.id).sort()).toEqual(['outer-A', 'outer-B']);
    expect(observed.every((item) => item.value.data.organic.length === 2)).toBe(true);
  });
});
