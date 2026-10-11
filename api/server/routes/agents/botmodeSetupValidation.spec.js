const { validateModelSelection, inspectAgentInventory, validateWorkerDelegation } = require('./botmodeSetupValidation');

describe('BOT MODE onboarding validation', () => {
  test('accepts only an exact model in the authenticated catalog', () => {
    const catalog = { openai: ['model-a'], ollama: ['local-model'] };
    expect(validateModelSelection(catalog, 'openai', 'model-a')).toBe(true);
    expect(validateModelSelection(catalog, 'openai', 'local-model')).toBe(false);
    expect(validateModelSelection(catalog, 'anthropic', 'model-a')).toBe(false);
    expect(validateModelSelection(catalog, 'openai', ' model-a ')).toBe(false);
    expect(validateModelSelection(catalog, 'openai', '')).toBe(false);
    expect(validateModelSelection(null, 'openai', 'model-a')).toBe(false);
  });

  test('requires precisely the five configured specialist targets', () => {
    const specialists = ['RECHERCHE', 'ANALYSE', 'CODE', 'DOCUMENTS', 'RÉDACTION'];
    const children = specialists.map((name, i) => ({ name, id: `child-${i}` }));
    const worker = {
      name: 'BOT MODE Worker',
      id: 'worker',
      subagents: { enabled: true, agent_ids: children.map((child) => child.id) },
    };
    expect(validateWorkerDelegation([worker, ...children], specialists)).toBe(true);
    expect(validateWorkerDelegation([
      { ...worker, subagents: { enabled: false, agent_ids: worker.subagents.agent_ids } },
      ...children,
    ], specialists)).toBe(false);
    expect(validateWorkerDelegation([
      { ...worker, subagents: { enabled: true, agent_ids: ['child-0', 'child-0', 'child-2', 'child-3', 'child-4'] } },
      ...children,
    ], specialists)).toBe(false);
    expect(validateWorkerDelegation([worker, ...children.slice(0, 4)], specialists)).toBe(false);
  });

  test('detects missing and duplicate agents without changing the inventory', () => {
    const expected = ['BOT MODE Worker', 'RECHERCHE', 'CODE'];
    const agents = [
      { name: 'BOT MODE Worker' },
      { name: 'RECHERCHE' },
      { name: 'RECHERCHE' },
    ];
    const original = JSON.stringify(agents);
    expect(inspectAgentInventory(agents, expected)).toEqual({
      missing: ['CODE'],
      duplicates: ['RECHERCHE'],
      complete: false,
    });
    expect(JSON.stringify(agents)).toBe(original);
    expect(inspectAgentInventory(expected.map((name) => ({ name })), expected)).toEqual({
      missing: [],
      duplicates: [],
      complete: true,
    });
  });
});
