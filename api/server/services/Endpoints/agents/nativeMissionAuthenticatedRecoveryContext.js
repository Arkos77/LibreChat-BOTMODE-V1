const { authorizeNativeMissionRecovery } = require('./nativeMissionRecoveryAuthorization');

/** Recover real host documents in the SAME admission pass as current policy.
 * No synthetic Express request, cached grants, or credentials are created.
 * The returned documents are only input to a future request-independent
 * initializer; callers must reauthorize before activating effects.
 */
function createNativeMissionAuthenticatedRecoveryContext(deps) {
  if (
    !deps ||
    ['getUserById', 'isOwnerAdmissible', 'getConvo', 'getAgent', 'canViewAgent'].some(
      (key) => typeof deps[key] !== 'function',
    )
  ) {
    throw new Error('NATIVE_MISSION_RECOVERY_CONTEXT_DEPENDENCIES_MISSING');
  }
  return async ({ candidate, job }) => {
    let user;
    let conversation;
    const agents = new Map();
    const authorization = await authorizeNativeMissionRecovery({
      candidate,
      job,
      deps: {
        ...deps,
        getUserById: async (id) => {
          user = await deps.getUserById(id);
          return user;
        },
        getConvo: async (owner, id) => {
          conversation = await deps.getConvo(owner, id);
          return conversation;
        },
        getAgent: async ({ id }) => {
          const agent = await deps.getAgent({ id });
          if (agent) agents.set(id, agent);
          return agent;
        },
      },
    });
    if (!authorization || !user || !conversation || agents.size !== authorization.agentIds.length) {
      throw new Error('NATIVE_MISSION_RECOVERY_CONTEXT_AUTHORITY_DENIED');
    }
    const orderedAgents = authorization.agentIds.map((id) => agents.get(id));
    if (
      orderedAgents.some((agent, index) => !agent || agent.id !== authorization.agentIds[index])
    ) {
      throw new Error('NATIVE_MISSION_RECOVERY_CONTEXT_AGENTS_MISMATCH');
    }
    return Object.freeze({
      authorization,
      user,
      conversation,
      agents: Object.freeze(orderedAgents),
    });
  };
}

module.exports = { createNativeMissionAuthenticatedRecoveryContext };
