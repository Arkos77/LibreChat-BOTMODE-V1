const {
  authorizeOrchestratorMissionBindings,
  assertAuthorizedOrchestratorTasks,
} = require('./orchestratorMissionBindings');

const worker = { id: 'worker', subagents: { enabled: true, agent_ids: ['research'] } };
const research = { id: 'research' };

describe('orchestrator mission authorized initialized bindings', () => {
  it('accepts initialized native specialist with no legacy agentConfigs binding', () => {
    const ids = authorizeOrchestratorMissionBindings({
      primaryAgentId: worker.id,
      reachableAgents: [worker, research],
      specialists: [{ agentId: research.id }],
    });
    expect([...ids]).toEqual(['worker', 'research']);
    expect(() => assertAuthorizedOrchestratorTasks([{ agentId: research.id }], ids)).not.toThrow();
  });

  it('rejects an unauthorized specialist even if provided in the request', () => {
    expect(() =>
      authorizeOrchestratorMissionBindings({
        primaryAgentId: worker.id,
        reachableAgents: [worker, research],
        specialists: [{ agentId: 'forged-agent' }],
      }),
    ).toThrow('Orchestrator specialist is not an authorized agent binding');
  });

  it('rejects a planner task referencing an unauthorized agent', () => {
    const ids = authorizeOrchestratorMissionBindings({
      primaryAgentId: worker.id,
      reachableAgents: [worker, research],
      specialists: [],
    });
    expect(() => assertAuthorizedOrchestratorTasks([{ agentId: 'forged-agent' }], ids)).toThrow(
      'Orchestrator plan selected an unauthorized agent binding',
    );
  });

  it('fails closed if the primary agent is not in the initialized graph', () => {
    expect(() =>
      authorizeOrchestratorMissionBindings({
        primaryAgentId: 'worker',
        reachableAgents: [research],
        specialists: [],
      }),
    ).toThrow('Orchestrator primary agent is not an initialized binding');
  });

  it('fails closed on missing graph or malformed specialist', () => {
    expect(() =>
      authorizeOrchestratorMissionBindings({
        primaryAgentId: 'worker',
        reachableAgents: null,
        specialists: [],
      }),
    ).toThrow();
    expect(() =>
      authorizeOrchestratorMissionBindings({
        primaryAgentId: 'worker',
        reachableAgents: [worker],
        specialists: [{ agentId: null }],
      }),
    ).toThrow('Orchestrator specialist is not an authorized agent binding');
  });
});
