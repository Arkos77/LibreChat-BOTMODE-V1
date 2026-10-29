const { prepareBotModeSettings } = require('./botModeSettings');

const settings = {
  version: 1,
  mode: 'analyze',
  selectionMode: 'auto',
  workerAgentId: 'worker',
  agents: [{ id: 'research', name: 'RECHERCHE' }],
};
const mission = {
  plannerContext: {
    worker: { agentId: 'worker' },
    specialists: [{ agentId: 'research' }],
  },
};

describe('BOT MODE turn admission', () => {
  it('requires the saved mission context instead of downgrading to chat', () => {
    expect(() => prepareBotModeSettings({ saved: settings, agentId: 'worker' })).toThrow(
      'BOTMODE_CONTEXT_REQUIRED',
    );
  });
  it('does not bypass the saved mode by omitting the selected agent', () => {
    expect(() => prepareBotModeSettings({ saved: settings })).toThrow('BOTMODE_CONTEXT_REQUIRED');
  });
  it('requires a real mission request for a deep mode', () => {
    expect(() => prepareBotModeSettings({ requested: settings, agentId: 'worker' })).toThrow(
      'execution mode',
    );
  });
  it('retains the settings for a newly authorized turn without any old execution identity', () => {
    expect(prepareBotModeSettings({ requested: settings, agentId: 'worker', mission })).toEqual(
      settings,
    );
  });
  it('accepts a minimal mission intent without client-owned topology', () => {
    expect(
      prepareBotModeSettings({
        requested: settings,
        agentId: 'worker',
        mission: {
          mission: { missionId: 'new-mission', taskId: 'new-task', objective: 'Analyze' },
        },
      }),
    ).toEqual(settings);
  });
  it('allows an explicit FAST turn without an old mission', () => {
    expect(
      prepareBotModeSettings({
        requested: { ...settings, mode: 'fast' },
        saved: settings,
        agentId: 'worker',
      }),
    ).toEqual({ ...settings, mode: 'fast' });
  });
  it('does not attach a mission to a legacy chat or another selected agent', () => {
    expect(prepareBotModeSettings({ agentId: 'worker' })).toBeUndefined();
    expect(prepareBotModeSettings({ saved: settings, agentId: 'other' })).toBeUndefined();
  });
  it.each([
    { requested: { ...settings, version: 2 }, agentId: 'worker', mission },
    { requested: settings, agentId: 'other', mission },
    {
      requested: settings,
      agentId: 'worker',
      mission: {
        plannerContext: {
          worker: { agentId: 'worker' },
          specialists: [{ agentId: 'undeclared' }],
        },
      },
    },
    {
      requested: {
        ...settings,
        selectionMode: 'manual',
        agents: [...settings.agents, { id: 'writing', name: 'RÉDACTION' }],
      },
      agentId: 'worker',
      mission,
    },
    { requested: { ...settings, mode: 'fast' }, agentId: 'worker', mission },
  ])('refuses an inconsistent or unsupported context %#', (input) => {
    expect(() => prepareBotModeSettings(input)).toThrow();
  });
});
