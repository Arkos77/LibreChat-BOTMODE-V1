'use strict';

/**
 * Mission-only, host-owned expansion of one authorized web_search invocation.
 *
 * Every provider query uses the already-loaded web_search executable and the
 * original request-scoped credentials. We combine source observations BEFORE
 * emitting the one normal tool-end event: the durable Oracle source receipt
 * remains bound to the real, checkpointed outer toolCallId.
 */
function createNativeResearchBatch(originalCallbacks, rawQueries) {
  if (
    !Array.isArray(rawQueries) ||
    rawQueries.length < 2 ||
    rawQueries.length > 3 ||
    rawQueries.some((query) => typeof query !== 'string' || query.length > 160 || !query.trim()) ||
    new Set(rawQueries.map((query) => query.trim().toLowerCase())).size !== rawQueries.length
  ) {
    throw new Error('BOTMODE_RESEARCH_BATCH_POLICY_INVALID');
  }
  const queries = rawQueries.map((query) => query.trim());
  const pending = new Map();

  const callbacks = {
    ...originalCallbacks,
    onSearchResults(result, config) {
      const id = config?.toolCall?.id;
      const entry = pending.get(id);
      if (!entry) throw new Error('BOTMODE_RESEARCH_BATCH_IDENTITY_MISSING');
      entry.push(result);
    },
  };

  function wrap(loadedTools) {
    const web = loadedTools?.find((tool) => tool.name === 'web_search');
    if (!web || typeof web.func !== 'function' || web.responseFormat !== 'content_and_artifact') {
      throw new Error('BOTMODE_RESEARCH_BATCH_TOOL_UNAVAILABLE');
    }
    const originalFunc = web.func.bind(web);
    web.func = async (argumentsFromModel, runManager, config) => {
      const id = config?.toolCall?.id;
      if (typeof id !== 'string' || !id) {
        throw new Error('BOTMODE_RESEARCH_BATCH_IDENTITY_MISSING');
      }
      if (pending.has(id)) throw new Error('BOTMODE_RESEARCH_BATCH_REENTRANT');
      pending.set(id, []);
      try {
        const outputs = [];
        // Sequential, bounded calls: no extra permission, actor or graph node.
        for (const query of queries) {
          const value = await originalFunc(
            {
              ...argumentsFromModel,
              query,
              date: undefined,
              images: false,
              videos: false,
              news: false,
            },
            runManager,
            config,
          );
          if (
            !Array.isArray(value) ||
            value.length !== 2 ||
            typeof value[0] !== 'string' ||
            !value[1]?.web_search
          ) {
            throw new Error('BOTMODE_RESEARCH_BATCH_RESULT_INVALID');
          }
          outputs.push(value);
        }

        const observations = pending.get(id);
        if (!observations || observations.length !== queries.length) {
          throw new Error('BOTMODE_RESEARCH_BATCH_OBSERVATION_MISSING');
        }
        const seenSources = new Set();
        const organic = [];
        const topStories = [];
        for (const observed of observations) {
          const data = observed?.data;
          const sources = [...(data?.organic ?? []), ...(data?.topStories ?? [])];
          if (observed.success !== true || !sources.some((source) => source.link)) {
            throw new Error('BOTMODE_RESEARCH_SUBJECT_SOURCES_REQUIRED');
          }
          for (const [name, target] of [
            ['organic', organic],
            ['topStories', topStories],
          ]) {
            for (const source of data?.[name] ?? []) {
              if (!source.link || seenSources.has(source.link)) continue;
              seenSources.add(source.link);
              target.push(source);
            }
          }
        }

        // One host-observed callback, one real toolCallId, with ALL fetched URLs.
        originalCallbacks.onSearchResults({ success: true, data: { organic, topStories } }, config);

        const mergedSources = new Set();
        const organicForModel = [];
        const topStoriesForModel = [];
        for (const item of outputs) {
          for (const [name, target] of [
            ['organic', organicForModel],
            ['topStories', topStoriesForModel],
          ]) {
            for (const source of item[1].web_search?.[name] ?? []) {
              if (!source.link || mergedSources.has(source.link)) continue;
              mergedSources.add(source.link);
              target.push(source);
            }
          }
        }
        const combinedText = outputs
          .map((item, i) => {
            // Preserve space for both topics even on context-limited models.
            return `Topic ${i + 1} / ${queries.length} (${queries[i]}):\n${item[0].slice(0, 11000)}`;
          })
          .join('\n\n');
        return [
          combinedText,
          {
            web_search: {
              organic: organicForModel,
              topStories: topStoriesForModel,
            },
            outcome: `Host-observed search batch: ${queries.length} subjects`,
          },
        ];
      } finally {
        pending.delete(id);
      }
    };
    return loadedTools;
  }

  return { callbacks, wrap };
}

module.exports = { createNativeResearchBatch };
