import type { TBotModeSettings } from 'librechat-data-provider';
import type { InitializedAgent } from '../initialize';
import type { Mission, MissionPlan, SpecialistDefinition } from './types';
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
}: {
  mission: Mission;
  settings: TBotModeSettings;
  reachableAgents: readonly InitializedAgent[];
  hasAttachments: boolean;
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
      constraints: [],
    };
  });
  const objectives = getBotModeObjectives(
    settings.mode as 'analyze' | 'develop' | 'watch',
    hasAttachments,
  );
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
