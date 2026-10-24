import type { InitializedAgent } from '../initialize';
import type { TBotModeSettings } from 'librechat-data-provider';
import type { Mission } from './types';
import { prepareBotModePlan } from './admission';

function fixture(selectionMode: 'auto' | 'manual' = 'auto', prefix = '') {
  const agents = [
    { id: `${prefix}worker`, name: 'Worker' },
    { id: `${prefix}research`, name: 'RECHERCHE', tools: ['web_search'] },
    { id: `${prefix}analysis`, name: 'ANALYSE' },
    { id: `${prefix}writing`, name: 'RÉDACTION' },
    { id: `${prefix}docs`, name: 'DOCUMENTS' },
    { id: `${prefix}code`, name: 'CODE' },
  ];
  const settings: TBotModeSettings = {
    version: 1,
    mode: 'analyze',
    selectionMode,
    workerAgentId: agents[0].id,
    agents: agents.slice(1).map(({ id, name }) => ({ id, name })),
  };
  const mission: Mission = {
    missionId: 'mission',
    taskId: 'task',
    objective: 'Comparer les options avec des sources',
    constraints: ['sans achat'],
    requiredCapabilities: [],
    objectives: [
      { key: 'synthesis', objective: 'répondre', requiredCapabilities: ['writing'], dependsOn: [] },
    ],
  };
  return {
    settings,
    mission,
    reachableAgents: agents as unknown as InitializedAgent[],
    hasAttachments: false,
  };
}

describe('BOT MODE canonical admission', () => {
  it('restores_required_research_and_dependencies', () => {
    const plan = prepareBotModePlan(fixture());
    expect(plan.tasks.map((task) => task.key)).toEqual(['research', 'analysis', 'synthesis']);
    expect(plan.tasks[1].dependsOn).toEqual(['research']);
    expect(plan.tasks[2].dependsOn).toEqual(['analysis']);
    expect(plan.tasks[0].validation.some((v) => v.outputContract === 'research-v1')).toBe(true);
    expect(plan.mission.objective).toBe('Comparer les options avec des sources');
    expect(plan.tasks.every((task) => task.constraints.includes('sans achat'))).toBe(true);
  });

  it('manual_keeps_required_graph without executing an unused selection', () => {
    const plan = prepareBotModePlan(fixture('manual'));
    expect(plan.tasks.map((task) => task.dependsOn)).toEqual([[], ['research'], ['analysis']]);
    expect(plan.tasks.map((task) => task.agentId)).toEqual(['research', 'analysis', 'writing']);
  });

  it('missing_capability_is_explicit', () => {
    const input = fixture('manual');
    input.settings.agents = input.settings.agents.filter((agent) => agent.id !== 'research');
    expect(() => prepareBotModePlan(input)).toThrow('Unavailable capability for task research');
  });

  it('client_names_do_not_assign_roles', () => {
    const input = fixture();
    input.settings.agents = input.settings.agents.filter((agent) => agent.id !== 'research');
    input.settings.agents.find((agent) => agent.id === 'code')!.name = 'RECHERCHE';
    expect(() => prepareBotModePlan(input)).toThrow('Unavailable capability for task research');
  });

  it('unknown_selected_agent_is_rejected', () => {
    const input = fixture();
    input.settings.agents.push({ id: 'forbidden', name: 'RECHERCHE' });
    expect(() => prepareBotModePlan(input)).toThrow('BOTMODE_AGENT_UNAVAILABLE');
  });

  it('rejects unrecognized saved roles instead of inferring capabilities', () => {
    const input = fixture();
    input.reachableAgents.find((agent) => agent.id === 'code')!.name = 'custom';
    expect(() => prepareBotModePlan(input)).toThrow('BOTMODE_AGENT_ROLE_UNSUPPORTED');
  });

  it('new_agent_ids_produce_same_topology', () => {
    const first = prepareBotModePlan(fixture());
    const second = prepareBotModePlan(fixture('manual', 'new-'));
    expect(second.tasks.map(({ key, dependsOn }) => ({ key, dependsOn }))).toEqual(
      first.tasks.map(({ key, dependsOn }) => ({ key, dependsOn })),
    );
    expect(second.tasks.every((task) => task.agentId.startsWith('new-'))).toBe(true);
  });

  it('does_not_mutate_inputs', () => {
    const input = fixture();
    const original = structuredClone(input);
    prepareBotModePlan(input);
    expect(input).toEqual(original);
  });

  it.each([true, false])('uses only current submission attachments: %s', (hasAttachments) => {
    const input = fixture();
    input.hasAttachments = hasAttachments;
    expect(prepareBotModePlan(input).tasks.some((task) => task.key === 'documentation')).toBe(
      hasAttachments,
    );
  });

  it('rejects FAST rather than converting it to a mission', () => {
    const input = fixture();
    input.settings.mode = 'fast';
    expect(() => prepareBotModePlan(input)).toThrow('BOTMODE_MISSION_MODE_REQUIRED');
  });

  it('rejects ambiguous identities', () => {
    const input = fixture();
    input.settings.agents.push(input.settings.agents[0]);
    expect(() => prepareBotModePlan(input)).toThrow('BOTMODE_AGENT_SELECTION_INVALID');
  });
});
