import { OPENROUTER_MODEL_PROFILES, selectOpenRouterModel } from './openRouterModels';

describe('OpenRouter model profiles', () => {
  it('keeps Nemotron active and free for agentic roles', () => {
    const p = selectOpenRouterModel({ role: 'research', toolCallingRequired: true });
    expect(p.id).toBe('nvidia/nemotron-3-ultra-550b-a55b:free');
    expect(p.status).toBe('ACTIVE');
    expect(p.toolMode).toBe('TOOL_CALLING');
  });

  it('routes text-only work to conditional uncensored models only when explicitly allowed', () => {
    expect(selectOpenRouterModel({ role: 'writing', toolCallingRequired: false }).id).toBe('nvidia/nemotron-3-ultra-550b-a55b:free');
    expect(selectOpenRouterModel({ role: 'writing', toolCallingRequired: false, allowConditional: true }).id).toBe('nvidia/nemotron-3-ultra-550b-a55b:free');
  });

  it('never selects a text-only model when tool calling is required', () => {
    const profiles = OPENROUTER_MODEL_PROFILES.filter((p) => p.toolMode === 'TEXT_ONLY');
    expect(profiles).toHaveLength(2);
    expect(() => selectOpenRouterModel({ role: 'writing', toolCallingRequired: true })).not.toThrow();
    expect(selectOpenRouterModel({ role: 'writing', toolCallingRequired: true }).toolMode).toBe('TOOL_CALLING');
  });
});
