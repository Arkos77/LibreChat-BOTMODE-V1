'use strict';

/** Pure validation shared by the authenticated BOT MODE onboarding route. */
const validateModelSelection = (catalog, provider, model) => {
  if (
    typeof provider !== 'string' ||
    !provider.trim() ||
    typeof model !== 'string' ||
    !model.trim()
  ) {
    return false;
  }
  // Match exactly: never silently choose another provider or trim into a
  // different model identifier. Only the caller's resolved catalog is trusted.
  return Array.isArray(catalog?.[provider]) && catalog[provider].includes(model);
};

const inspectAgentInventory = (agents, expectedNames) => {
  const missing = expectedNames.filter((name) => !agents.some((agent) => agent.name === name));
  const duplicates = expectedNames.filter(
    (name) => agents.filter((agent) => agent.name === name).length > 1,
  );
  return { missing, duplicates, complete: missing.length === 0 && duplicates.length === 0 };
};

const validateWorkerDelegation = (agents, expectedSpecialists) => {
  const worker = agents.find((agent) => agent.name === 'BOT MODE Worker');
  const targetIds = expectedSpecialists.map(
    (name) => agents.find((agent) => agent.name === name)?.id,
  );
  if (!worker || targetIds.some((id) => typeof id !== 'string' || !id)) return false;
  const actualIds = worker.subagents?.agent_ids;
  return (
    worker.subagents?.enabled === true &&
    Array.isArray(actualIds) &&
    actualIds.length === targetIds.length &&
    new Set(actualIds).size === targetIds.length &&
    targetIds.every((id) => actualIds.includes(id))
  );
};

const inspectMissingCapabilities = (agents, requiredTools) =>
  agents.flatMap((agent) => {
    const required = requiredTools[agent.name] ?? [];
    const granted = Array.isArray(agent.tools) ? agent.tools : [];
    const deniedTools = required.filter((tool) => !granted.includes(tool));
    return deniedTools.length > 0 ? [{ name: agent.name, deniedTools }] : [];
  });

// Never treat legacy placeholder prompts, or unrestricted tool grants, as a
// completed V1. User-edited prompts are not overwritten or fingerprinted:
// the check only rejects known placeholders and effectively empty instructions.
const inspectRoleReadiness = (agents, profiles) => {
  const unconfiguredInstructions = [];
  const unexpectedCapabilities = [];
  for (const agent of agents) {
    const profile = profiles[agent.name];
    if (!profile) continue;
    const instructions = typeof agent.instructions === 'string' ? agent.instructions.trim() : '';
    if (
      instructions.length < 160 ||
      /^Tu es le spécialiste .+ de BOT MODE\. Réponds en français\.$/u.test(instructions) ||
      instructions === 'Tu es le Worker principal BOT MODE. Délègue uniquement selon les autorisations.'
    ) {
      unconfiguredInstructions.push(agent.name);
    }
    const granted = Array.isArray(agent.tools) ? agent.tools : [];
    const unexpectedTools = granted.filter((tool) => !profile.tools.includes(tool));
    if (unexpectedTools.length > 0) {
      unexpectedCapabilities.push({ name: agent.name, unexpectedTools });
    }
  }
  return { unconfiguredInstructions, unexpectedCapabilities };
};

module.exports = {
  inspectRoleReadiness,
  validateModelSelection,
  inspectAgentInventory,
  validateWorkerDelegation,
  inspectMissingCapabilities,
};
