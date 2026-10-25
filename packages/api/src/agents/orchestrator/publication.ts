import type { MissionPlan } from './types';
import type { MissionOracleState } from './missionOracle';
import { normalizeSourceUrls, supportsResearchResult } from '../oracle/sources';
import {
  areMissionOracleResultsEquivalent,
  normalizeMissionOracleState,
  validateMissionTask,
} from './missionOracle';

export async function renderMissionPublication(
  plan: MissionPlan,
  state?: MissionOracleState,
): Promise<string | undefined> {
  if (!plan.tasks.some((task) => task.validation.some((v) => v.outputContract === 'research-v2')))
    return undefined;
  const fail: () => never = () => {
    throw new Error('BOTMODE_VERIFIED_PRESENTATION_REQUIRED');
  };
  if (plan.mission.researchExecutionVersion !== 1 || plan.tasks.length > 256) fail();
  const saved = normalizeMissionOracleState(state);
  if (
    Object.keys(saved.results).length !== plan.tasks.length ||
    new Set(plan.tasks.map((task) => task.taskId)).size !== plan.tasks.length
  )
    fail();
  const candidates = new Map<string, { result: string; sources?: string }>();
  const urls = new Set<string>();
  const observations = [] as NonNullable<MissionOracleState['sources']>[string];
  for (const task of plan.tasks) {
    const result = saved.results[task.taskId];
    const candidate = result?.verdicts[0]?.input.candidate;
    if (
      !candidate ||
      !task.validation.length ||
      result?.taskId !== task.taskId ||
      result.nodeId !== task.nodeId ||
      result.verdicts.length !== task.validation.length ||
      result.verdicts.some((v) => v.status !== 'VERIFIED' || v.input.candidate !== candidate)
    )
      fail();
    const checked = await validateMissionTask({
      taskId: task.taskId,
      nodeId: task.nodeId,
      agentId: task.agentId,
      candidate,
      requirements: task.validation,
      evidence: saved.evidence[task.taskId] ?? [],
      observedSources: saved.sources?.[task.taskId] ?? [],
    });
    if (
      !areMissionOracleResultsEquivalent(result, checked) ||
      checked.verdicts.some((v) => v.status !== 'VERIFIED')
    )
      fail();
    const parsed: { result: string; sources?: string } = JSON.parse(candidate);
    candidates.set(task.taskId, parsed);
    if (
      task.validation.some((v) => ['research-v1', 'research-v2'].includes(v.outputContract ?? ''))
    ) {
      if (typeof parsed.sources !== 'string') fail();
      for (const url of normalizeSourceUrls(
        parsed.sources
          .split(/\r?\n/)
          .map((url) => url.trim())
          .filter(Boolean),
      ))
        urls.add(url);
      observations.push(...(saved.sources?.[task.taskId] ?? []));
    }
  }
  const dependencies = new Set(plan.tasks.flatMap((task) => task.dependsOn));
  const terminal = plan.tasks.filter((task) => !dependencies.has(task.key));
  if (terminal.length !== 1 || urls.size === 0 || urls.size > 32) fail();
  const text = candidates.get(terminal[0].taskId)?.result;
  const sources = [...urls];
  if (
    !text?.trim() ||
    !supportsResearchResult(text, sources.join('\n'), observations, 'research-v2')
  )
    fail();
  return `${text}\n\nSources\n${sources.map((url) => `- <${url}>`).join('\n')}`;
}
