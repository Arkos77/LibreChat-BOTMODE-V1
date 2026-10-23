import { botModeSettingsSchema, resolveBotModeSearchParams } from './botMode';
import { tConversationSchema, tPresetSchema } from './schemas';

const savedSettings = {
  version: 1,
  mode: 'analyze',
  selectionMode: 'auto',
  workerAgentId: 'worker',
  agents: [{ id: 'researcher', name: 'RECHERCHE' }],
};

describe('durable BOT MODE settings', () => {
  it('survives conversation parsing after a reload', () => {
    const conversation = tConversationSchema.parse({
      conversationId: 'saved',
      endpoint: 'agents',
      agent_id: 'worker',
      createdAt: '2026-10-23',
      updatedAt: '2026-10-23',
      botMode: savedSettings,
    });
    expect(conversation).toHaveProperty('botMode', savedSettings);
  });

  it('does not carry a mission into an unrelated chat through a preset', () => {
    const preset = tPresetSchema.parse({
      endpoint: 'agents',
      createdAt: '2026-10-23',
      updatedAt: '2026-10-23',
      botMode: savedSettings,
    });
    expect(preset).not.toHaveProperty('botMode');
  });
});

describe('restoring the conversation route context', () => {
  const botMode = botModeSettingsSchema.parse(savedSettings);
  const conversation = { conversationId: 'saved', endpoint: 'agents', agent_id: 'worker', botMode };
  it('restores saved selection without mutating the route or replaying a prompt', () => {
    const route = new URLSearchParams('projectId=p');
    const restored = resolveBotModeSearchParams(route, conversation);
    expect(restored.get('botmode_mode')).toBe('analyze');
    expect(restored.get('botmode_agent_bindings')).toBe('[{"id":"researcher","name":"RECHERCHE"}]');
    expect(restored.has('submit')).toBe(false);
    expect(restored.has('prompt')).toBe(false);
    expect(route.toString()).toBe('projectId=p');
  });
  it('restores the admitted mode when the URL only retains the BOT MODE flag', () => {
    const restored = resolveBotModeSearchParams(new URLSearchParams('botmode=1'), conversation);
    expect(restored.get('botmode_mode')).toBe('analyze');
  });
  it('preserves an explicit FAST choice over the saved mission', () => {
    expect(
      resolveBotModeSearchParams(
        new URLSearchParams('botmode=1&botmode_mode=fast'),
        conversation,
      ).get('botmode_mode'),
    ).toBe('fast');
  });
  it.each([
    { endpoint: 'agents', agent_id: 'other', botMode },
    { endpoint: 'openAI', agent_id: 'worker', botMode },
    { endpoint: 'agents', agent_id: 'worker' },
    { conversationId: 'new', endpoint: 'agents', agent_id: 'worker', botMode },
    { conversationId: null, endpoint: 'agents', agent_id: 'worker', botMode },
  ])('does not copy the mode to another agent, endpoint, or legacy chat %#', (target) => {
    expect(resolveBotModeSearchParams(new URLSearchParams(), target).has('botmode')).toBe(false);
  });
  it.each([
    { ...savedSettings, version: 2 },
    { ...savedSettings, agents: [...savedSettings.agents, ...savedSettings.agents] },
    { ...savedSettings, agents: [] },
    { ...savedSettings, agents: [{ id: 'worker', name: 'Worker' }] },
  ])('refuses settings which cannot safely describe a mission %#', (input) => {
    expect(botModeSettingsSchema.safeParse(input).success).toBe(false);
  });
});
