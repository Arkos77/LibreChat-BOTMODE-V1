const { validateModelSelection, inspectAgentInventory } = require('./botmodeSetupValidation');

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
