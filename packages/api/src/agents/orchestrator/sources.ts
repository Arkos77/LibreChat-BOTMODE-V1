import type { SearchResultData } from 'librechat-data-provider';
import type { GenericTool } from '@librechat/agents';
import type { InitializedAgent } from '../initialize';
import type { MissionPlan } from './types';
import { normalizeSourceUrls } from '../oracle/sources';

export function collectSearchSourceUrls(data?: SearchResultData): string[] {
  if (data == null || data.error != null) return [];
  const links = [
    ...(data.organic ?? []).map((source) => source.link),
    ...(data.topStories ?? []).map((source) => source.link),
    ...(data.references ?? [])
      .filter((source) => source.type === 'link')
      .map((source) => source.link),
  ];
  const urls = new Set<string>();
  for (const link of links) {
    try {
      urls.add(normalizeSourceUrls([link])[0]);
    } catch {
      continue;
    }
    if (urls.size === 32) break;
  }
  return [...urls];
}

export function assertResearchToolAvailability(
  plan: MissionPlan,
  agents: readonly (Pick<InitializedAgent, 'id' | 'toolDefinitions' | 'toolRegistry'> & {
    tools?: readonly (string | GenericTool)[];
  })[],
): void {
  for (const task of plan.tasks) {
    if (
      !task.validation.some((requirement) =>
        ['research-v1', 'research-v2'].includes(requirement.outputContract ?? ''),
      )
    )
      continue;
    const agent = agents.find((entry) => entry.id === task.agentId);
    const loaded = agent?.tools?.some((tool) =>
      typeof tool === 'string'
        ? tool === 'web_search'
        : tool != null && 'name' in tool && tool.name === 'web_search',
    );
    const defined = agent?.toolDefinitions?.some((tool) => tool.name === 'web_search');
    const registered = agent?.toolRegistry?.has('web_search');
    if (!loaded && !defined && !registered) {
      throw new Error('BOTMODE_WEB_SEARCH_UNAVAILABLE');
    }
  }
}
