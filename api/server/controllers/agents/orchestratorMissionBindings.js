/** Fail-closed admission from the authenticated, initialized runtime graph. */
function authorizeOrchestratorMissionBindings({ primaryAgentId, reachableAgents, specialists }) {
  const authorizedAgentIds = new Set(
    (Array.isArray(reachableAgents) ? reachableAgents : [])
      .map((agent) => agent?.id)
      .filter((id) => typeof id === 'string' && id.length > 0),
  );
  if (!authorizedAgentIds.has(primaryAgentId)) {
    throw new Error('Orchestrator primary agent is not an initialized binding');
  }
  if (!Array.isArray(specialists)) {
    throw new Error('Invalid orchestrator mission request');
  }
  for (const specialist of specialists) {
    if (
      specialist == null ||
      typeof specialist.agentId !== 'string' ||
      !authorizedAgentIds.has(specialist.agentId)
    ) {
      throw new Error('Orchestrator specialist is not an authorized agent binding');
    }
  }
  return authorizedAgentIds;
}

function assertAuthorizedOrchestratorTasks(tasks, authorizedAgentIds) {
  if (!Array.isArray(tasks)) {
    throw new Error('Invalid orchestrator mission plan');
  }
  for (const task of tasks) {
    if (!authorizedAgentIds.has(task?.agentId)) {
      throw new Error('Orchestrator plan selected an unauthorized agent binding');
    }
  }
}

module.exports = { authorizeOrchestratorMissionBindings, assertAuthorizedOrchestratorTasks };
