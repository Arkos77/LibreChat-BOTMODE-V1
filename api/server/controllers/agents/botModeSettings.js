const { botModeSettingsSchema } = require('librechat-data-provider');

/** Settings describe the next turn; they never resume or authorize a previous plan. */
function prepareBotModeSettings({ requested, saved, agentId, mission }) {
  const previous = saved == null ? undefined : botModeSettingsSchema.parse(saved);
  if (requested == null) {
    if (
      previous != null &&
      previous.mode !== 'fast' &&
      (agentId == null || previous.workerAgentId === agentId)
    ) {
      throw new Error(
        'BOTMODE_CONTEXT_REQUIRED: Restore the saved mission settings before sending.',
      );
    }
    return undefined;
  }
  const settings = botModeSettingsSchema.parse(requested);
  if (settings.workerAgentId !== agentId) {
    throw new Error('BOT MODE settings must match the selected agent');
  }
  if ((settings.mode !== 'fast') !== (mission != null)) {
    throw new Error('BOT MODE settings must match the mission execution mode');
  }
  if (mission != null) {
    const selected = new Set(settings.agents.map((agent) => agent.id));
    const specialists = mission.plannerContext?.specialists;
    if (
      mission.plannerContext?.worker?.agentId !== settings.workerAgentId ||
      !Array.isArray(specialists) ||
      specialists.length === 0 ||
      specialists.some((agent) => !selected.has(agent?.agentId)) ||
      (settings.selectionMode === 'manual' &&
        (specialists.length !== selected.size ||
          new Set(specialists.map((agent) => agent.agentId)).size !== selected.size))
    ) {
      throw new Error('BOT MODE settings do not match the mission specialists');
    }
  }
  return settings;
}

module.exports = { prepareBotModeSettings };
