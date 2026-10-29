import { buildWebSearchContext, buildWebSearchDynamicContext } from './web';

jest.mock('librechat-data-provider', () => ({
  Tools: { web_search: 'web_search' },
  replaceSpecialVars: jest.fn(
    ({ text, now, timezone }: { text: string; now?: string; timezone?: string }) => {
      if (text.includes('current_datetime')) {
        return timezone === 'Europe/Paris' ? '2026-10-07 00:09:00 +02:00 (Wednesday)' : 'LOCAL';
      }
      return now ?? 'NOW';
    },
  ),
}));

describe('web search context', () => {
  it('keeps static context free of volatile date replacements and forbids current-state extrapolation', () => {
    const context = buildWebSearchContext();

    expect(context).toContain('web_search');
    expect(context).not.toContain('NOW');
    expect(context).not.toContain('{{iso_datetime}}');
    expect(context).toContain('Never infer or extrapolate a current value from older observations');
    expect(context).toContain('use `current_state` for those facts even when the same request');
    expect(context).toContain('call the necessary tools in parallel rather than serially');
  });

  it('guides the model to answer directly when a search is not warranted', () => {
    const context = buildWebSearchContext();

    expect(context).toContain('respond directly without searching');
    expect(context).toContain('current, real-time, or otherwise beyond your own knowledge');
  });

  it('uses direct observed URLs for internal results while preserving the default presentation format', () => {
    const internal = buildWebSearchContext({ citationFormat: 'direct-urls' });
    expect(internal).toContain('INTERNAL RESEARCH OUTPUT');
    expect(internal).toContain('Reproduce each cited observed URL literally in the result string');
    expect(internal).not.toContain('CITATION FORMAT - UNICODE');
    expect(internal).not.toContain('then provide a brief summary');
    expect(internal).toContain(
      'Never infer or extrapolate a current value from older observations',
    );
    expect(buildWebSearchContext()).toContain('CITATION FORMAT - UNICODE');
    expect(buildWebSearchContext()).not.toContain('INTERNAL RESEARCH OUTPUT');
  });

  it('builds dynamic context from the supplied turn anchor and user timezone', () => {
    const context = buildWebSearchDynamicContext('2026-10-06T22:09:00.000Z', 'Europe/Paris');
    const secondContext = buildWebSearchDynamicContext('2026-10-06T22:09:00.000Z', 'Europe/Paris');

    expect(context).toContain(
      'Authoritative Turn Date & Time: 2026-10-07 00:09:00 +02:00 (Wednesday)',
    );
    expect(context).toContain('Turn Instant (UTC ISO): 2026-10-06T22:09:00.000Z');
    expect(context).toContain('User Timezone: Europe/Paris');
    expect(context).toContain('Older observations must stay labeled with their own timestamp');
    expect(secondContext).toBe(context);
  });
});
