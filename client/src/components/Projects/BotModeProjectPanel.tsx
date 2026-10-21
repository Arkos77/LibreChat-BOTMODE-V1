import { useState } from 'react';
import { v4 } from 'uuid';
import { Button } from '@librechat/client';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { dataService, QueryKeys } from 'librechat-data-provider';
import { Activity, CircleDashed, Clock3, ListTree, Radio, ShieldCheck, Wallet } from 'lucide-react';
import type { ParentSubagentSummary, TConversation } from 'librechat-data-provider';
import {
  useBotModeProjectProjectionQuery,
  useListAgentsQuery,
  useGetAgentByIdQuery,
  useParentSubagentsQuery,
  useSubagentControlMutation,
} from '~/data-provider';
import { subagentStatusDotClass, subagentStatusLabelKey } from '~/components/Chat/Subagents/status';
import { useLocalize } from '~/hooks';

const MISSION_STATE_LABEL_KEYS = {
  idle: 'com_ui_bot_mode_project_state_idle',
  attention: 'com_ui_bot_mode_project_state_attention',
  authorized: 'com_ui_bot_mode_project_state_authorized',
  committed: 'com_ui_bot_mode_project_state_committed',
  recovery: 'com_ui_bot_mode_project_state_recovery',
  verified: 'com_ui_bot_mode_project_state_verified',
  running: 'com_ui_bot_mode_project_state_running',
  settled: 'com_ui_bot_mode_project_state_settled',
} as const;

const MTO_STEPS = [
  'REQUESTED',
  'PLANNED',
  'DECIDED',
  'AUTHORIZED',
  'COMMITTED',
  'SETTLED',
] as const;

function ConversationTasks({ conversation }: { conversation: TConversation }) {
  const localize = useLocalize();
  const conversationId = conversation.conversationId ?? '';
  const { data } = useParentSubagentsQuery(conversationId, { enabled: conversationId !== '' });
  const controlTask = useSubagentControlMutation();
  const children = data?.children ?? [];

  const submitControl = (child: ParentSubagentSummary, action: 'pause' | 'resume') => {
    if (!child.latestTaskId) {
      return;
    }
    controlTask.mutate({
      parentConversationId: conversationId,
      threadId: child.threadId,
      submittedAt: new Date().toISOString(),
      command: {
        taskId: child.latestTaskId,
        invocationId: v4(),
        action,
      },
    });
  };

  if (children.length === 0) {
    return null;
  }

  return (
    <section className="rounded-xl border border-border-light bg-surface-secondary/60 p-3">
      <div className="mb-2 truncate text-sm font-medium text-text-primary">
        {conversation.title || localize('com_ui_untitled')}
      </div>
      <div className="space-y-2">
        {children.map((child: ParentSubagentSummary) => {
          const canPause = child.status === 'running' && Boolean(child.latestTaskId);
          const canResume = child.status === 'paused' && Boolean(child.latestTaskId);
          const pausePending = child.status === 'pause_requested';
          return (
            <article key={child.threadId} className="flex items-center gap-2 text-sm">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${subagentStatusDotClass(child.status)}`}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-text-primary">{child.title}</span>
              <span className="shrink-0 text-xs text-text-secondary">
                {localize(subagentStatusLabelKey(child.status))}
              </span>
              {canPause && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={controlTask.isLoading}
                  onClick={() => submitControl(child, 'pause')}
                >
                  {localize('com_ui_subagent_pause_task')}
                </Button>
              )}
              {canResume && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={controlTask.isLoading}
                  onClick={() => submitControl(child, 'resume')}
                >
                  {localize('com_ui_subagent_resume_task')}
                </Button>
              )}
              {pausePending && (
                <Button type="button" size="sm" variant="outline" disabled>
                  {localize('com_ui_subagent_thread_status_pause_requested')}
                </Button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default function BotModeProjectPanel({
  projectId,
  conversations,
  compact = false,
  showSummary = true,
}: {
  projectId: string;
  conversations: TConversation[];
  compact?: boolean;
  showSummary?: boolean;
}) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [setupPending, setSetupPending] = useState(false);
  const [setupError, setSetupError] = useState('');
  const [setupModels, setSetupModels] = useState<Array<{ provider: string; model: string }>>([]);
  const [selectedSetupModel, setSelectedSetupModel] = useState('');
  const { data: agents } = useListAgentsQuery();
  const [agentMode, setAgentMode] = useState<'auto' | 'manual'>('auto');
  const [chosenAgentIds, setChosenAgentIds] = useState<string[]>([]);
  const {
    data: projection,
    isLoading: isProjectionLoading,
    isError: isProjectionError,
  } = useBotModeProjectProjectionQuery(projectId, {
    enabled: projectId !== '',
  });
  const projectConversations = conversations.filter((conversation) => conversation.conversationId);
  const evidence =
    projection?.conversations.flatMap((conversation) =>
      conversation.traces.flatMap((trace) =>
        trace.observations.map((observation) => ({ traceId: trace.traceId, observation })),
      ),
    ) ?? [];
  const plans =
    projection?.conversations.flatMap((conversation) =>
      conversation.plans.map((entry) => entry.plan),
    ) ?? [];
  const tasks = plans.flatMap((plan) => plan.tasks);
  const oracleObservations = evidence.filter(({ observation }) => observation.source === 'oracle');
  const verifiedObservations = oracleObservations.filter(
    ({ observation }) => observation.type === 'VERIFIED',
  );
  const hasRejectedOracle = oracleObservations.some(
    ({ observation }) => observation.type === 'REJECTED',
  );
  const mtoTypes = evidence
    .map(({ observation }) => observation.type)
    .filter((type): type is string => Boolean(type));
  const latestMtoType = [...mtoTypes]
    .reverse()
    .find((type) =>
      [
        'REQUESTED',
        'PLANNED',
        'DECIDED',
        'AUTHORIZED',
        'COMMITTED',
        'SETTLED',
        'REPLAN',
        'RECOVERY',
      ].includes(type),
    );
  const hasSettled = latestMtoType === 'SETTLED';
  const missionState = ((): keyof typeof MISSION_STATE_LABEL_KEYS => {
    if (plans.length === 0 && !hasSettled) return 'idle';
    if (hasRejectedOracle) return 'attention';
    if (hasSettled) return 'settled';
    if (latestMtoType === 'AUTHORIZED' || latestMtoType === 'DECIDED') return 'authorized';
    if (latestMtoType === 'COMMITTED') return 'committed';
    if (latestMtoType === 'REPLAN' || latestMtoType === 'RECOVERY') return 'recovery';
    if (verifiedObservations.length > 0) return 'verified';
    return 'running';
  })();
  // Never launch a BOT MODE mission against an arbitrary agent from the list.
  const primaryAgent = agents?.data?.find((agent) => agent.name === 'BOT MODE Worker');

  const { data: workerDetails } = useGetAgentByIdQuery(primaryAgent?.id);
  const authorizedIds = new Set(
    workerDetails?.subagents?.enabled === true ? (workerDetails.subagents.agent_ids ?? []) : [],
  );
  const specialists = (agents?.data ?? []).filter(
    (agent) => agent.id && agent.id !== primaryAgent?.id && authorizedIds.has(agent.id),
  );
  const selectedSpecialists = specialists.filter((agent) => chosenAgentIds.includes(agent.id));

  const initializeAgents = async () => {
    if (setupPending) return;
    setSetupPending(true);
    setSetupError('');
    try {
      const catalog = await dataService.getModels();
      const configured = Object.entries(catalog).flatMap(([provider, models]) =>
        provider !== 'agents' && Array.isArray(models)
          ? models
              .filter((model): model is string => typeof model === 'string' && model.trim() !== '')
              .map((model) => ({ provider, model }))
          : [],
      );
      if (configured.length === 0) {
        setSetupError('Aucun modèle configuré : ajoutez une clé API ou un fournisseur local.');
        return;
      }
      if (configured.length > 1 && setupModels.length === 0) {
        setSetupModels(configured);
        setSetupError('Sélectionnez un modèle avant de lancer l’initialisation.');
        return;
      }
      const selected =
        configured.length === 1 ? configured[0] : setupModels[Number(selectedSetupModel)];
      if (
        !selected ||
        !configured.some(
          (item) => item.provider === selected.provider && item.model === selected.model,
        )
      ) {
        setSetupModels(configured);
        setSetupError('Sélectionnez un modèle disponible pour continuer.');
        return;
      }
      const result = await dataService.initializeBotModeAgents(selected);
      await queryClient.invalidateQueries([QueryKeys.agents]);
      if (!result.capabilitiesComplete) {
        setSetupError('Agents créés, mais certains outils ne sont pas disponibles ou autorisés.');
      }
    } catch (_error) {
      setSetupError('Initialisation BOT MODE impossible. Vérifiez le modèle et les permissions.');
    } finally {
      setSetupPending(false);
    }
  };

  const launchMission = () => {
    if (!primaryAgent?.id || (agentMode === 'manual' && selectedSpecialists.length === 0)) {
      return;
    }
    const params = new URLSearchParams({
      projectId,
      agent_id: primaryAgent.id,
      prompt: `Lance une mission BOT MODE et produis un résultat vérifiable. ${agentMode === 'auto' ? 'Choisis les spécialistes existants autorisés en fonction de la mission.' : `Privilégie uniquement ces spécialistes déclarés dans la configuration du Worker (nom et identifiant) : ${selectedSpecialists.map((agent) => `${agent.name} [${agent.id}]`).join(', ')}.`} Respecte toutes les autorisations de délégation ; ne contourne aucun refus.`,
      submit: 'true',
      botmode: '1',
      botmode_mode: 'analyze',
      ...(agentMode === 'manual'
        ? { botmode_agent_ids: selectedSpecialists.map((agent) => agent.id).join(',') }
        : {}),
    });
    navigate(`/c/new?${params.toString()}`);
  };

  const currentStepIndex = latestMtoType
    ? MTO_STEPS.indexOf(latestMtoType as (typeof MTO_STEPS)[number])
    : -1;
  const progressStep = hasSettled ? MTO_STEPS.length : Math.max(currentStepIndex + 1, 0);

  return (
    <section
      className={compact ? 'space-y-3' : 'mt-8 space-y-4'}
      aria-label={localize('com_ui_bot_mode_project_activity')}
    >
      {showSummary && (
        <div
          className={
            compact
              ? 'rounded-xl border border-border-light bg-surface-secondary/50 p-3'
              : 'rounded-2xl border border-border-light bg-surface-secondary/50 p-4 md:p-5'
          }
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              {!compact && (
                <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-text-secondary">
                  <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                  {localize('com_ui_bot_mode_project_activity')}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  className={
                    compact
                      ? 'text-base font-semibold tracking-tight text-text-primary'
                      : 'text-lg font-semibold tracking-tight text-text-primary'
                  }
                >
                  {localize(MISSION_STATE_LABEL_KEYS[missionState])}
                </h2>
                <span
                  className="rounded-full border border-border-light bg-surface-secondary px-2 py-0.5 text-xs font-medium text-text-secondary"
                  data-testid="bot-mode-project-state"
                >
                  {progressStep}/{MTO_STEPS.length}
                </span>
              </div>
              <p className="mt-1 text-sm text-text-secondary">
                {localize('com_ui_bot_mode_project_mission_progress', {
                  step: latestMtoType ?? '—',
                })}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              {primaryAgent?.id ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={agentMode === 'manual' && selectedSpecialists.length === 0}
                  onClick={launchMission}
                >
                  {localize('com_ui_bot_mode_project_launch')}
                </Button>
              ) : (
                <>
                  {setupModels.length > 1 && (
                    <select
                      aria-label="Modèle BOT MODE"
                      className="max-w-64 rounded border border-border-light bg-surface-primary p-2 text-sm"
                      value={selectedSetupModel}
                      onChange={(event) => setSelectedSetupModel(event.target.value)}
                      disabled={setupPending}
                    >
                      <option value="">{localize('com_ui_select_model')}</option>
                      {setupModels.map(({ provider, model }, index) => (
                        <option key={`${provider}:${model}`} value={String(index)}>
                          {provider} — {model}
                        </option>
                      ))}
                    </select>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    disabled={setupPending || (setupModels.length > 1 && selectedSetupModel === '')}
                    onClick={initializeAgents}
                  >
                    {setupPending ? 'Initialisation…' : 'Initialiser BOT MODE'}
                  </Button>
                </>
              )}
              {setupError && (
                <span role="alert" className="text-xs text-red-600">
                  {setupError}
                </span>
              )}
            </div>
          </div>

          <div
            className="mt-4 space-y-3 rounded-xl border border-border-light p-3"
            aria-label="Sélection des agents BOT MODE"
          >
            <div className="text-sm font-semibold text-text-primary">
              Comment choisir les spécialistes ?
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                aria-pressed={agentMode === 'auto'}
                onClick={() => setAgentMode('auto')}
                className={`rounded-lg border p-3 text-left text-sm ${agentMode === 'auto' ? 'border-blue-500 bg-blue-500/10' : 'border-border-light'}`}
              >
                <strong>Automatique</strong>
                <span className="mt-1 block text-xs text-text-secondary">
                  Le Worker choisit les agents autorisés selon la mission.
                </span>
              </button>
              <button
                type="button"
                aria-pressed={agentMode === 'manual'}
                onClick={() => setAgentMode('manual')}
                className={`rounded-lg border p-3 text-left text-sm ${agentMode === 'manual' ? 'border-blue-500 bg-blue-500/10' : 'border-border-light'}`}
              >
                <strong>Choisir mes agents</strong>
                <span className="mt-1 block text-xs text-text-secondary">
                  Sélectionner un ou plusieurs spécialistes existants.
                </span>
              </button>
            </div>
            {agentMode === 'manual' && (
              <div className="grid gap-2 sm:grid-cols-2" aria-label="Spécialistes disponibles">
                {specialists.map((agent) => (
                  <label
                    key={agent.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-border-light p-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={chosenAgentIds.includes(agent.id)}
                      onChange={(event) =>
                        setChosenAgentIds((ids) =>
                          event.target.checked
                            ? [...ids, agent.id]
                            : ids.filter((id) => id !== agent.id),
                        )
                      }
                    />
                    <span className="truncate">{agent.name}</span>
                  </label>
                ))}
                {specialists.length === 0 && (
                  <p className="text-sm text-text-secondary">
                    Aucun spécialiste autorisé dans la configuration du Worker.
                  </p>
                )}
              </div>
            )}
            <details className="text-sm text-text-secondary">
              <summary className="cursor-pointer">Options avancées</summary>
              <p className="mt-2">
                Les autorisations de délégation et la validation Oracle restent contrôlées par BOT
                MODE.
              </p>
            </details>
          </div>
          <div className="mt-5 grid grid-cols-6 gap-1.5" aria-label="Mission progress">
            {MTO_STEPS.map((step, index) => {
              const isComplete = index < progressStep;
              const isCurrent = index === progressStep - 1 && !hasSettled;
              return (
                <div key={step} className="min-w-0">
                  <div className="flex items-center">
                    <div
                      className={`h-1.5 w-full rounded-full ${
                        isComplete ? 'bg-text-primary' : 'bg-surface-tertiary'
                      }`}
                      aria-hidden="true"
                    />
                  </div>
                  <div
                    className={`mt-1 truncate text-[10px] font-medium uppercase tracking-wide ${
                      isCurrent ? 'text-text-primary' : 'text-text-tertiary'
                    }`}
                  >
                    {step}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isProjectionLoading && (
        <div
          className="rounded-xl border border-border-light bg-surface-secondary/60 p-3 text-xs text-text-secondary"
          role="status"
        >
          {localize('com_ui_bot_mode_project_loading')}
        </div>
      )}
      {isProjectionError && (
        <div
          className="rounded-xl border border-border-light bg-surface-secondary/60 p-3 text-xs text-text-secondary"
          role="alert"
        >
          {localize('com_ui_bot_mode_project_error')}
        </div>
      )}

      {showSummary && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-border-light bg-surface-secondary/40 p-3">
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
              {localize('com_ui_bot_mode_project_cost')}
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-text-primary">
              {projection?.totals.costKnown ? `$${projection.totals.cost.toFixed(2)}` : '—'}
            </div>
          </div>
          <div className="rounded-xl border border-border-light bg-surface-secondary/40 p-3">
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <ListTree className="h-3.5 w-3.5" aria-hidden="true" />
              {localize('com_ui_bot_mode_project_plans')}
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-text-primary">
              {plans.length}
            </div>
          </div>
          <div className="rounded-xl border border-border-light bg-surface-secondary/40 p-3">
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <CircleDashed className="h-3.5 w-3.5" aria-hidden="true" />
              {localize('com_ui_bot_mode_project_tasks')}
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-text-primary">
              {tasks.length}
            </div>
          </div>
          <div className="rounded-xl border border-border-light bg-surface-secondary/40 p-3">
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {localize('com_ui_bot_mode_project_oracle')}
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-text-primary">
              {verifiedObservations.length}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
        <section className="rounded-2xl border border-border-light bg-surface-secondary/30 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-text-primary">
                {localize('com_ui_bot_mode_project_plans')}
              </div>
              <div className="mt-0.5 text-xs text-text-secondary">
                {tasks.length} {localize('com_ui_bot_mode_project_tasks').toLowerCase()}
              </div>
            </div>
            <ListTree className="h-4 w-4 text-text-secondary" aria-hidden="true" />
          </div>
          {plans.length > 0 ? (
            <div className="space-y-2">
              {plans.map((plan, planIndex) => (
                <div
                  key={plan.planId ?? `plan-${planIndex}`}
                  className="rounded-xl border border-border-light bg-presentation/40 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {plan.objective && (
                        <div className="text-sm font-medium text-text-primary">
                          {plan.objective}
                        </div>
                      )}
                      {plan.strategy && (
                        <div className="mt-1 text-xs text-text-secondary">{plan.strategy}</div>
                      )}
                    </div>
                    <span className="shrink-0 text-[11px] tabular-nums text-text-tertiary">
                      {plan.tasks.length} {localize('com_ui_bot_mode_project_tasks').toLowerCase()}
                    </span>
                  </div>
                  {plan.tasks.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {plan.tasks.map((task, taskIndex) => (
                        <div
                          key={task.taskId ?? `${plan.planId ?? planIndex}:task-${taskIndex}`}
                          className="flex items-start gap-2 text-xs"
                        >
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-text-secondary" />
                          <span className="min-w-0 text-text-secondary">
                            {task.objective ?? task.taskId}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border-light px-3 py-5 text-sm text-text-secondary">
              {localize('com_ui_bot_mode_project_no_plan_yet')}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border-light bg-surface-secondary/30 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-text-primary">
                {localize('com_ui_bot_mode_project_evidence')}
              </div>
              <div className="mt-0.5 text-xs text-text-secondary">
                {evidence.length} {localize('com_ui_bot_mode_project_recent_events')}
              </div>
            </div>
            <Radio className="h-4 w-4 text-text-secondary" aria-hidden="true" />
          </div>
          {evidence.length > 0 ? (
            <div className="space-y-2">
              {evidence.slice(-6).map(({ traceId, observation }, index) => (
                <div
                  key={`${traceId}:${observation.traceEventId ?? index}`}
                  className="flex items-center gap-2 text-xs"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-text-secondary"
                    aria-hidden="true"
                  />
                  <span className="w-20 shrink-0 font-medium text-text-primary">
                    {observation.type ?? 'EVENT'}
                  </span>
                  <span className="min-w-0 truncate text-text-tertiary">{traceId}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border-light px-3 py-5 text-sm text-text-secondary">
              {localize('com_ui_bot_mode_project_no_events_yet')}
            </div>
          )}
        </section>
      </div>

      {projectConversations.length > 0 && (
        <section className="rounded-2xl border border-border-light bg-surface-secondary/30 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-text-secondary" aria-hidden="true" />
            <div>
              <div className="text-sm font-semibold text-text-primary">
                {localize('com_ui_bot_mode_project_subagents')}
              </div>
              <div className="mt-0.5 text-xs text-text-secondary">
                {localize('com_ui_bot_mode_project_subagents_hint')}
              </div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {projectConversations.map((conversation) => (
              <ConversationTasks key={conversation.conversationId} conversation={conversation} />
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
