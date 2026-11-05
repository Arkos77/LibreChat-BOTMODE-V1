import { Providers } from '@librechat/agents';
import type { MissionOracleState } from './missionOracle';
import { validateMissionTask, normalizeMissionOracleState } from './missionOracle';
import { projectObservedResearchSources } from './researchSourceProjection';
import { buildWebSearchContext } from '~/tools/toolkits/web';
import { renderMissionPublication } from './publication';
import { prepareBotModeMission } from './output';
import { deterministicPlanner } from './planner';
import { compileNativePlan } from './native';

const url = 'https://ci-source.invalid/report';
async function fixture() {
  const plan = deterministicPlanner.planMission(
    prepareBotModeMission(
      {
        missionId: 'presentation',
        taskId: 'root',
        objective: 'Read, analyze, synthesize',
        constraints: [],
        requiredCapabilities: ['web_search', 'analysis', 'writing'],
        objectives: [
          {
            key: 'research',
            objective: 'Read',
            requiredCapabilities: ['web_search'],
            dependsOn: [],
          },
          {
            key: 'analysis',
            objective: 'Analyze',
            requiredCapabilities: ['analysis'],
            dependsOn: ['research'],
          },
          {
            key: 'synthesis',
            objective: 'Synthesize',
            requiredCapabilities: ['writing'],
            dependsOn: ['analysis'],
          },
        ],
      },
      { researchContract: 'research-v2' },
    ),
    {
      worker: {
        id: 'worker',
        agentId: 'worker',
        role: 'worker',
        capabilities: ['web_search', 'analysis', 'writing'],
        constraints: [],
      },
      specialists: [],
    },
  );
  const state: MissionOracleState = {
    evidence: {},
    results: {},
    sources: {
      [plan.tasks[0].taskId]: [{ toolCallId: 'native-search', urls: [url] }],
    },
  };
  for (const task of plan.tasks) {
    const candidate = JSON.stringify({
      ok: true,
      result:
        task.key === 'synthesis'
          ? 'Synthèse du rapport contrôlé.'
          : 'Rapport : trois contrôles passés.',
      ...(task.key === 'research' && { sources: url }),
    });
    state.results[task.taskId] = await validateMissionTask({
      taskId: task.taskId,
      nodeId: task.nodeId,
      agentId: task.agentId,
      requirements: task.validation,
      candidate,
      observedSources: state.sources?.[task.taskId] ?? [],
    });
  }
  return { plan, state };
}

describe('verified research publication', () => {
  it('renders one final result and the exact verified source after four verdicts, without changing raw candidates', async () => {
    const { plan, state } = await fixture();
    expect(plan.tasks[0].validation.map((v) => v.outputContract)).toEqual([
      'result-v1',
      'research-v2',
    ]);
    expect(Object.values(state.results).flatMap((v) => v.verdicts.map((x) => x.status))).toEqual([
      'VERIFIED',
      'VERIFIED',
      'VERIFIED',
      'VERIFIED',
    ]);
    const before = structuredClone(state);
    const text = await renderMissionPublication(plan, normalizeMissionOracleState(state));
    expect(text).toBe('Synthèse du rapport contrôlé.\n\nSources\n- <' + url + '>');
    expect(state).toEqual(before);
    expect(await renderMissionPublication(plan, structuredClone(state))).toBe(text);
  });

  it.each([
    'missing',
    'rejected',
    'foreign-source',
    'wrong-node',
    'wrong-agent',
    'tampered-criterion',
    'invented-final-link',
    'empty-final',
  ])('refuses publication with %s', async (mode) => {
    const { plan, state } = await fixture();
    const task = plan.tasks[0];
    const final = state.results[plan.tasks[2].taskId].verdicts[0];
    if (mode === 'missing') delete state.results[task.taskId];
    if (mode === 'rejected') state.results[task.taskId].verdicts[1].status = 'REJECTED';
    if (mode === 'foreign-source') state.sources = { foreign: state.sources![task.taskId] };
    if (mode === 'wrong-node') state.results[task.taskId].nodeId = 'foreign';
    if (mode === 'wrong-agent') state.results[task.taskId].verdicts[0].input.agentId = 'foreign';
    if (mode === 'tampered-criterion') state.results[task.taskId].verdicts[1].input.criteria = [];
    if (mode === 'invented-final-link' || mode === 'empty-final') {
      const candidate = JSON.stringify({
        ok: true,
        result: mode === 'empty-final' ? '' : 'See https://forged.invalid/report',
      });
      const last = plan.tasks[2];
      state.results[last.taskId] = await validateMissionTask({
        taskId: last.taskId,
        nodeId: last.nodeId,
        agentId: last.agentId,
        candidate,
        requirements: last.validation,
      });
    }
    await expect(renderMissionPublication(plan, state)).rejects.toThrow();
    expect(final.input.candidate).toBeDefined();
  });

  it('replays and publishes an explicitly audited source correction with only observed URLs', async () => {
    const { plan, state } = await fixture();
    const task = plan.tasks[0];
    state.sources = {
      [task.taskId]: [
        {
          toolCallId: 'current-web-search',
          urls: [
            'http://fastapi.tiangolo.com/',
            'http://github.com/tiangolo/fastapi',
            'https://docs.rs/actix-web',
          ],
        },
      ],
    };
    const original = JSON.stringify({
      ok: true,
      result:
        'FastAPI https://fastapi.tiangolo.com and unobserved code ' +
        'https://github.com/fastapi/fastapi versus Actix Web https://docs.rs/actix-web.',
      sources: [
        'https://fastapi.tiangolo.com',
        'https://github.com/fastapi/fastapi',
        'https://docs.rs/actix-web',
      ].join('\n'),
    });
    const projection = projectObservedResearchSources(original, state.sources[task.taskId]);
    expect(projection.audit).toBeDefined();
    const result = await validateMissionTask({
      taskId: task.taskId,
      nodeId: task.nodeId,
      agentId: task.agentId,
      requirements: task.validation,
      candidate: projection.candidate,
      observedSources: state.sources[task.taskId],
    });
    expect(result.verdicts.map((verdict) => verdict.status)).toEqual(['VERIFIED', 'VERIFIED']);
    result.sourceProjection = projection.audit;
    state.results[task.taskId] = result;
    const normalized = normalizeMissionOracleState(state);
    const rendered = await renderMissionPublication(plan, normalized);
    expect(rendered).toContain('http://fastapi.tiangolo.com/');
    expect(rendered).toContain('https://docs.rs/actix-web');
    expect(rendered).not.toContain('github.com/fastapi/fastapi');
    expect(await renderMissionPublication(plan, structuredClone(state))).toBe(rendered);
    expect(normalized.results[task.taskId].sourceProjection?.originalCandidate).toBe(original);

    const tampered = structuredClone(state);
    tampered.results[task.taskId].sourceProjection!.removedUrls = [];
    await expect(renderMissionPublication(plan, tampered)).rejects.toThrow();
    const lostAudit = structuredClone(state);
    delete lostAudit.results[task.taskId].sourceProjection;
    await expect(renderMissionPublication(plan, lostAudit)).rejects.toThrow();
    const forgedOriginal = structuredClone(state);
    forgedOriginal.results[task.taskId].sourceProjection!.originalCandidate = JSON.stringify({
      ok: true,
      result: 'Forged https://attacker.invalid/source',
      sources: 'https://attacker.invalid/source',
    });
    await expect(renderMissionPublication(plan, forgedOriginal)).rejects.toThrow();
  });

  it('corrects the observed false Oracle-tool disclaimer only in a fully verified presentation', async () => {
    const { plan, state } = await fixture();
    const task = plan.tasks[2];
    const disclaimer =
      "- La vérification avec Oracle n'a pas pu être effectuée (aucun outil Oracle disponible dans cette tâche) ; le résultat repose uniquement sur les preuves amont et l'analyse ci-dessus.";
    const original = JSON.stringify({
      ok: true,
      result: `Comparatif FastAPI / Actix Web.\n${disclaimer}\nDes benchmarks restent nécessaires.`,
    });
    state.results[task.taskId] = await validateMissionTask({
      taskId: task.taskId,
      nodeId: task.nodeId,
      agentId: task.agentId,
      candidate: original,
      requirements: task.validation,
    });
    const before = structuredClone(state);
    const rendered = await renderMissionPublication(plan, state);
    expect(rendered).toContain(
      'Vérification Oracle : 3 étapes vérifiées par le moteur BOT MODE après exécution.',
    );
    expect(rendered).not.toContain("La vérification avec Oracle n'a pas pu être effectuée");
    expect(rendered).toContain('Des benchmarks restent nécessaires.');
    expect(rendered).toContain(url);
    expect(state).toEqual(before);
    expect(state.results[task.taskId].verdicts[0].input.candidate).toBe(original);

    const rejected = structuredClone(state);
    rejected.results[plan.tasks[0].taskId].verdicts[0].status = 'REJECTED';
    await expect(renderMissionPublication(plan, rejected)).rejects.toThrow();
  });

  it('preserves unrelated discussion of external Oracle availability', async () => {
    const { plan, state } = await fixture();
    const task = plan.tasks[2];
    const independentCaveat = 'Aucun Oracle tiers ne fournit de benchmark RAM vérifiable.';
    const original = JSON.stringify({ ok: true, result: independentCaveat });
    state.results[task.taskId] = await validateMissionTask({
      taskId: task.taskId,
      nodeId: task.nodeId,
      agentId: task.agentId,
      candidate: original,
      requirements: task.validation,
    });
    const rendered = await renderMissionPublication(plan, state);
    expect(rendered).toContain(independentCaveat);
  });

  it('tells the writing specialist that Oracle belongs to the host, without granting an Oracle tool', async () => {
    const { plan } = await fixture();
    const compiled = compileNativePlan(
      plan,
      new Map([
        [
          'worker',
          {
            agentId: 'worker',
            provider: Providers.OPENROUTER,
            clientOptions: {},
            instructions: buildWebSearchContext(),
            toolDefinitions: [{ name: 'web_search' }],
          },
        ],
      ]),
    );
    const writer = compiled.graphConfig.agents.find(
      (agent) => agent.agentId === plan.tasks[2].nodeId,
    );
    expect(writer?.instructions).toContain('Oracle verification is performed independently');
    expect(writer?.instructions).toContain('it is not a specialist tool');
    expect(writer?.toolDefinitions?.some((tool) => tool.name === 'oracle')).toBeFalsy();
  });

  it('does not reinterpret any historic v1 plan or candidate', async () => {
    const { plan, state } = await fixture();
    const old = structuredClone(plan);
    for (const task of old.tasks)
      for (const v of task.validation)
        if (v.outputContract === 'research-v2') v.outputContract = 'research-v1';
    expect(await renderMissionPublication(old, state)).toBeUndefined();
  });
});

it('preserves a stricter explicit v1 requirement on a v2 task', async () => {
  const { plan, state } = await fixture();
  const task = plan.tasks[0];
  task.validation.push({
    outputContract: 'research-v1',
    criteria: [{ id: 'completed', field: 'ok', expected: true }],
  });
  const compiled = compileNativePlan(
    plan,
    new Map([
      [
        'worker',
        {
          agentId: 'worker',
          provider: Providers.OPENROUTER,
          clientOptions: {},
          instructions: buildWebSearchContext(),
          toolDefinitions: [{ name: 'web_search' }],
        },
      ],
    ]),
  );
  expect(compiled.graphConfig.agents[1].instructions).toContain(
    'Reproduce each cited observed URL literally',
  );
  await expect(renderMissionPublication(plan, state)).rejects.toThrow();
});
