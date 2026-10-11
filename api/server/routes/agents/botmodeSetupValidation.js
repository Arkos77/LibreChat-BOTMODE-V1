'use strict';

/** Pure validation shared by the authenticated BOT MODE onboarding route. */
const validateModelSelection = (catalog, provider, model) => {
  if (typeof provider !== 'string' || !provider.trim() ||
      typeof model !== 'string' || !model.trim()) {
    return false;
  }
  // Match exactly: never silently choose another provider or trim into a
  // different model identifier. Only the caller's resolved catalog is trusted.
  return Array.isArray(catalog?.[provider]) && catalog[provider].includes(model);
};

const inspectAgentInventory = (agents, expectedNames) => {
  const missing = expectedNames.filter(
    (name) => !agents.some((agent) => agent.name === name),
  );
  const duplicates = expectedNames.filter(
    (name) => agents.filter((agent) => agent.name === name).length > 1,
  );
  return { missing, duplicates, complete: missing.length === 0 && duplicates.length === 0 };
};

module.exports = { validateModelSelection, inspectAgentInventory };
