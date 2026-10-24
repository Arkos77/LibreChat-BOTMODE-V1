import type { TBotModeSettings } from 'librechat-data-provider';
import type { InitializedAgent } from '../initialize';
import type { Mission, MissionPlan, PlannerContext, SpecialistDefinition } from './types';
import { getBotModeObjectives } from './objectives';
import { prepareBotModeMission } from './output';
import { deterministicPlanner } from './planner';

/** Initial profile hints only. Native execution permissions are checked separately. */
const profiles = new Map<string, { role: string; capabilities: string[] }>([
  ['RECHERCHE', { role: 'research', capabilities: ['web_search'] }],
  ['ANALYSE', { role: 'analysis', capabilities: ['analysis'] }],
  ['CODE', { role: 'engineering', capabilities: ['execute_code'] }],
  ['DOCUMENTS', { role: 'documents', capabilities: ['file_search'] }],
  ['RÉDACTION', { role: 'writing', capabilities: ['writing'] }],
]);

/** Resolve complete host-owned recipes; never infer grants from request labels. */
export function prepareBotModePlan({
  mission,
  settings,
  reachableAgents,
  hasAttachments,
  legacyContext,
}: {
  mission: Mission;
  settings: TBotModeSettings;
  reachableAgents: readonly InitializedAgent[];
  hasAttachments: boolean;
  legacyContext?: PlannerContext;
}): MissionPlan {
  if (!['analyze', 'develop', 'watch'].includes(settings.mode)) {
    throw new Error('BOTMODE_MISSION_MODE_REQUIRED');
  }
  const selectedIds = settings.agents.map((agent) => agent.id);
  if (
    selectedIds.length === 0 ||
    new Set(selectedIds).size !== selectedIds.length ||
    selectedIds.includes(settings.workerAgentId)
  ) {
    throw new Error('BOTMODE_AGENT_SELECTION_INVALID');
  }
  const initialized = new Map(reachableAgents.map((agent) => [agent.id, agent]));
  if (!initialized.has(settings.workerAgentId)) {
    throw new Error('BOTMODE_AGENT_UNAVAILABLE');
  }
  // Old clients may add obligations, but never assign roles or grants. Reject
  // ambiguous bindings rather than accepting and silently discarding checks.
  const legacySpecialists = legacyContext?.specialists ?? [];
  const legacyAgents = new Map(legacySpecialists.map((agent) => [agent.agentId, agent]));
  if (
    legacyAgents.size !== legacySpecialists.length ||
    legacySpecialists.some((agent) => !selectedIds.includes(agent.agentId))
  ) {
    throw new Error('BOTMODE_LEGACY_AGENT_REQUIREMENTS_UNMAPPED');
  }
  if (legacyContext?.worker.constraints?.length || legacyContext?.worker.validation != null) {
    throw new Error('BOTMODE_LEGACY_WORKER_REQUIREMENTS_UNSUPPORTED');
  }
  const specialists: SpecialistDefinition[] = selectedIds.map((agentId) => {
    const saved = initialized.get(agentId);
    if (saved == null) throw new Error('BOTMODE_AGENT_UNAVAILABLE');
    const profile = saved.name == null ? undefined : profiles.get(saved.name);
    if (profile == null) throw new Error(`BOTMODE_AGENT_ROLE_UNSUPPORTED: ${agentId}`);
    return {
      id: `specialist:${agentId}`,
      agentId,
      role: profile.role,
      capabilities: [...profile.capabilities],
      constraints: [...(legacyAgents.get(agentId)?.constraints ?? [])],
      validation: structuredClone(legacyAgents.get(agentId)?.validation),
    };
  });
  const canonical = getBotModeObjectives(
    settings.mode as 'analyze' | 'develop' | 'watch',
    hasAttachments,
  );
  const previousObjectives = mission.objectives ?? [];
  const previousByKey = new Map(previousObjectives.map((task) => [task.key, task]));
  if (previousByKey.size !== previousObjectives.length) {
    throw new Error('BOTMODE_LEGACY_TASK_IDENTITIES_INVALID');
  }
  const canonicalKeys = new Set(canonical.map((task) => task.key));
  if (
    previousObjectives.some(
      (task) =>
        !canonicalKeys.has(task.key) && (task.constraints?.length || task.validation != null),
    )
  ) {
    throw new Error('BOTMODE_LEGACY_TASK_REQUIREMENTS_UNMAPPED');
  }
  const objectives = canonical.map((task) => ({
    ...task,
    constraints: [...(previousByKey.get(task.key)?.constraints ?? [])],
    validation: structuredClone(previousByKey.get(task.key)?.validation),
  }));
  const admitted = prepareBotModeMission({
    ...mission,
    objectives,
    requiredCapabilities: [...new Set(objectives.flatMap((task) => task.requiredCapabilities))],
  });
  return deterministicPlanner.planMission(admitted, {
    worker: {
      id: 'worker',
      agentId: settings.workerAgentId,
      role: 'worker',
      capabilities: ['basic'],
      constraints: [],
    },
    specialists,
  });
}
