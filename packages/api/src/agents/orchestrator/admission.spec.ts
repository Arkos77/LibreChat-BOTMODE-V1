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

  it('preserves additive legacy objective and authorized specialist obligations', () => {
    const input = fixture();
    const objectiveValidation = {
      criteria: [{ id: 'independent', field: 'verified', expected: true }],
      requireIndependentEvidence: true,
    };
    input.mission.objectives = [
      {
        key: 'research',
        objective: 'Research',
        requiredCapabilities: ['web_search'],
        dependsOn: [],
        constraints: ['sources officielles'],
        validation: objectiveValidation,
      },
    ];
    const legacyContext = {
      worker: {
        id: 'worker',
        agentId: 'worker',
        role: 'worker',
        capabilities: ['basic'],
        constraints: [],
      },
      specialists: [
        {
          id: 'custom-hint',
          agentId: 'research',
          role: 'forged-role',
          capabilities: ['fabricated'],
          constraints: ['sans données personnelles'],
          validation: { criteria: [{ id: 'custom', field: 'checked', expected: true }] },
        },
      ],
    };
    const before = structuredClone({ input, legacyContext });
    const plan = prepareBotModePlan({ ...input, legacyContext });
    const task = plan.tasks[0];
    expect(task.constraints).toEqual(
      expect.arrayContaining(['sans achat', 'sources officielles', 'sans données personnelles']),
    );
    expect(task.validation).toEqual(
      expect.arrayContaining([
        expect.objectContaining(objectiveValidation),
        legacyContext.specialists[0].validation,
      ]),
    );
    expect(task.validation.some((v) => v.outputContract === 'research-v1')).toBe(true);
    expect(task.requiredCapabilities).toEqual(['web_search']);
    expect({ input, legacyContext }).toEqual(before);
  });

  it('refuses to discard obligations on an unmappable legacy task', () => {
    const input = fixture();
    input.mission.objectives = [
      {
        key: 'selected_1',
        objective: 'custom task',
        requiredCapabilities: [],
        dependsOn: [],
        constraints: ['required check'],
      },
    ];
    expect(() => prepareBotModePlan(input)).toThrow('BOTMODE_LEGACY_TASK_REQUIREMENTS_UNMAPPED');
  });

  it('refuses to discard obligations on an unselected legacy specialist', () => {
    const input = fixture();
    const legacyContext = {
      worker: {
        id: 'worker',
        agentId: 'worker',
        role: 'worker',
        capabilities: [],
        constraints: [],
      },
      specialists: [
        {
          id: 'extra',
          agentId: 'outside',
          role: 'research',
          capabilities: [],
          constraints: ['must check'],
        },
      ],
    };
    expect(() => prepareBotModePlan({ ...input, legacyContext })).toThrow(
      'BOTMODE_LEGACY_AGENT_REQUIREMENTS_UNMAPPED',
    );
  });

  it('rejects ambiguous legacy task obligations', () => {
    const input = fixture();
    input.mission.objectives = [
      input.mission.objectives![0],
      { ...input.mission.objectives![0], constraints: ['extra'] },
    ];
    expect(() => prepareBotModePlan(input)).toThrow('BOTMODE_LEGACY_TASK_IDENTITIES_INVALID');
  });

  it('rejects ambiguous legacy specialist obligations', () => {
    const input = fixture();
    const specialist = {
      id: 'research',
      agentId: 'research',
      role: 'research',
      capabilities: [],
      constraints: ['extra'],
    };
    const legacyContext = {
      worker: { ...specialist, id: 'worker', agentId: 'worker', constraints: [] },
      specialists: [specialist, specialist],
    };
    expect(() => prepareBotModePlan({ ...input, legacyContext })).toThrow(
      'BOTMODE_LEGACY_AGENT_REQUIREMENTS_UNMAPPED',
    );
  });

  it('refuses unsupported worker-only legacy obligations explicitly', () => {
    const input = fixture();
    const legacyContext = {
      worker: {
        id: 'worker',
        agentId: 'worker',
        role: 'worker',
        capabilities: [],
        constraints: ['worker-only obligation'],
      },
      specialists: [],
    };
    expect(() => prepareBotModePlan({ ...input, legacyContext })).toThrow(
      'BOTMODE_LEGACY_WORKER_REQUIREMENTS_UNSUPPORTED',
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
