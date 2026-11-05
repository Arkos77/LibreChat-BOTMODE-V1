import type { MissionOracleState } from './missionOracle';
import type { MissionPlan } from './types';
import {
  areMissionOracleResultsEquivalent,
  normalizeMissionOracleState,
  validateMissionTask,
} from './missionOracle';
import { normalizeSourceUrls, supportsResearchResult } from '../oracle/sources';
import { projectObservedResearchSources } from './researchSourceProjection';

export async function renderMissionPublication(
  plan: MissionPlan,
  state?: MissionOracleState,
): Promise<string | undefined> {
  if (!plan.tasks.some((task) => task.validation.some((v) => v.outputContract === 'research-v2')))
    return undefined;
  const fail: () => never = () => {
    throw new Error('BOTMODE_VERIFIED_PRESENTATION_REQUIRED');
  };
  if (![1, 2].includes(plan.mission.researchExecutionVersion ?? 0) || plan.tasks.length > 256)
    fail();
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
    const candidateRecord = JSON.parse(candidate) as Record<string, unknown>;
    if (
      (candidateRecord.__botModeSourceProjection === 'observed-source-projection-v1') !==
      (result.sourceProjection?.policy === 'observed-source-projection-v1')
    )
      fail();
    if (result.sourceProjection != null) {
      if (!task.validation.some((requirement) => requirement.outputContract === 'research-v2'))
        fail();
      const replay = projectObservedResearchSources(
        result.sourceProjection.originalCandidate,
        saved.sources?.[task.taskId] ?? [],
      );
      if (
        replay.candidate !== candidate ||
        JSON.stringify(replay.audit) !== JSON.stringify(result.sourceProjection)
      )
        fail();
    }
    const checked = await validateMissionTask({
      taskId: task.taskId,
      nodeId: task.nodeId,
      agentId: task.agentId,
      candidate,
      requirements: task.validation,
      evidence: saved.evidence[task.taskId] ?? [],
      observedSources: saved.sources?.[task.taskId] ?? [],
    });
    if (result.sourceProjection != null) checked.sourceProjection = result.sourceProjection;
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
  // Presentation only, after every independent Oracle verdict has been replayed.
  // Keep the original candidate and its Oracle evidence unchanged in durable state.
  // Remove only the known false statement that confuses a specialist's tools
  // with the host-owned Oracle; do not rewrite other verification claims.
  const staleOracleToolDisclaimer =
    /^[ \t]*-[ \t]*La vérification avec Oracle n['’]a pas pu être effectuée \(aucun outil Oracle disponible dans cette tâche\) ; le résultat repose uniquement sur les preuves amont et l['’]analyse ci-dessus\.[ \t]*$/gm;
  const verifiedCount = plan.tasks.length;
  const displayedText = text.replace(
    staleOracleToolDisclaimer,
    `- Vérification Oracle : ${verifiedCount} ${verifiedCount === 1 ? 'étape vérifiée' : 'étapes vérifiées'} par le moteur BOT MODE après exécution.`,
  );
  return `${displayedText}\n\nSources\n${sources.map((url) => `- <${url}>`).join('\n')}`;
}
