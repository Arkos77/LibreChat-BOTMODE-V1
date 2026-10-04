import { v4 } from 'uuid';
import { Button } from '@librechat/client';
import { useNavigate } from 'react-router-dom';
import { Activity, CircleDashed, Clock3, ListTree, Radio, ShieldCheck, Wallet } from 'lucide-react';
import type { ParentSubagentSummary, TConversation } from 'librechat-data-provider';
import {
  useBotModeProjectProjectionQuery,
  useListAgentsQuery,
  useParentSubagentsQuery,
  useSubagentControlMutation,
} from '~/data-provider';
import { subagentStatusDotClass, subagentStatusLabelKey } from '~/components/Chat/Subagents/status';
import { useLocalize } from '~/hooks';

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
}: {
  projectId: string;
  conversations: TConversation[];
}) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { data: agents } = useListAgentsQuery();
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
  const missionState = (() => {
    if (plans.length === 0 && !hasSettled) return 'idle';
    if (hasRejectedOracle) return 'attention';
    if (hasSettled) return 'settled';
    if (latestMtoType === 'AUTHORIZED' || latestMtoType === 'DECIDED') return 'authorized';
    if (latestMtoType === 'COMMITTED') return 'committed';
    if (latestMtoType === 'REPLAN' || latestMtoType === 'RECOVERY') return 'recovery';
    if (verifiedObservations.length > 0) return 'verified';
    return 'running';
  })();
  const primaryAgent = agents?.data?.[0];

  const launchMission = () => {
    if (!primaryAgent?.id) {
      return;
    }
    const params = new URLSearchParams({
      projectId,
      agent_id: primaryAgent.id,
      prompt: 'Lance une mission BOT MODE et produis un résultat vérifiable.',
      submit: 'true',
      botmode: '1',
    });
    navigate(`/c/new?${params.toString()}`);
  };

  const currentStepIndex = latestMtoType
    ? MTO_STEPS.indexOf(latestMtoType as (typeof MTO_STEPS)[number])
    : -1;
  const progressStep = hasSettled ? MTO_STEPS.length : Math.max(currentStepIndex + 1, 0);

  return (
    <section className="mt-8 space-y-4" aria-label={localize('com_ui_bot_mode_project_activity')}>
      <div className="rounded-2xl border border-border-light bg-surface-secondary/50 p-4 md:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-text-secondary">
              <Activity className="h-3.5 w-3.5" aria-hidden="true" />
              {localize('com_ui_bot_mode_project_activity')}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight text-text-primary">
                {localize(`com_ui_bot_mode_project_state_${missionState}`)}
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
          <Button type="button" size="sm" disabled={!primaryAgent?.id} onClick={launchMission}>
            {localize('com_ui_bot_mode_project_launch')}
          </Button>
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
