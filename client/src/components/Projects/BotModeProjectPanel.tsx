import { v4 } from 'uuid';
import { Button } from '@librechat/client';
import { CheckCircle2, CircleDashed, ListTree, Radio, Wallet } from 'lucide-react';
import type { ParentSubagentSummary, TConversation } from 'librechat-data-provider';
import {
  useBotModeProjectProjectionQuery,
  useParentSubagentsQuery,
  useSubagentControlMutation,
} from '~/data-provider';
import { subagentStatusDotClass, subagentStatusLabelKey } from '~/components/Chat/Subagents/status';
import { useLocalize } from '~/hooks';

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
  const verifiedObservations = oracleObservations.filter(({ observation }) => observation.type === 'VERIFIED');
  const hasRejectedOracle = oracleObservations.some(({ observation }) => observation.type === 'REJECTED');
  const missionState = plans.length === 0
    ? 'idle'
    : hasRejectedOracle
      ? 'attention'
      : verifiedObservations.length > 0
        ? 'verified'
        : 'running';

  if (projectConversations.length === 0) {
    return null;
  }

  return (
    <section className="mt-8" aria-label={localize('com_ui_bot_mode_project_activity')}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-text-primary">
          {localize('com_ui_bot_mode_project_activity')}
        </h2>
        <span className="text-xs text-text-secondary">{missionState}</span>
      </div>
      {isProjectionLoading && (
        <div className="mb-3 rounded-xl border border-border-light bg-surface-secondary/60 p-3 text-xs text-text-secondary" role="status">
          {localize('com_ui_bot_mode_project_loading')}
        </div>
      )}
      {isProjectionError && (
        <div className="mb-3 rounded-xl border border-border-light bg-surface-secondary/60 p-3 text-xs text-text-secondary" role="alert">
          {localize('com_ui_bot_mode_project_error')}
        </div>
      )}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-border-light bg-surface-secondary/60 p-2.5">
          <div className="flex items-center gap-1.5 text-xs text-text-secondary"><Wallet className="h-3.5 w-3.5" aria-hidden="true" />Cost</div>
          <div className="mt-1 text-sm font-medium text-text-primary">{projection?.totals.costKnown ? `$${projection.totals.cost.toFixed(2)}` : '—'}</div>
        </div>
        <div className="rounded-xl border border-border-light bg-surface-secondary/60 p-2.5">
          <div className="flex items-center gap-1.5 text-xs text-text-secondary"><ListTree className="h-3.5 w-3.5" aria-hidden="true" />Plans</div>
          <div className="mt-1 text-sm font-medium text-text-primary">{plans.length}</div>
        </div>
        <div className="rounded-xl border border-border-light bg-surface-secondary/60 p-2.5">
          <div className="flex items-center gap-1.5 text-xs text-text-secondary"><CircleDashed className="h-3.5 w-3.5" aria-hidden="true" />Tasks</div>
          <div className="mt-1 text-sm font-medium text-text-primary">{tasks.length}</div>
        </div>
        <div className="rounded-xl border border-border-light bg-surface-secondary/60 p-2.5">
          <div className="flex items-center gap-1.5 text-xs text-text-secondary"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Oracle</div>
          <div className="mt-1 text-sm font-medium text-text-primary">{verifiedObservations.length}</div>
        </div>
      </div>
      {plans.length > 0 && (
        <div className="mb-3 space-y-2">
          {plans.map((plan, planIndex) => (
            <section
              key={plan.planId ?? `plan-${planIndex}`}
              className="rounded-xl border border-border-light bg-surface-secondary/60 p-3"
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {plan.objective && (
                  <span className="font-medium text-text-primary">{plan.objective}</span>
                )}
                {plan.strategy && (
                  <span className="text-xs text-text-secondary">{plan.strategy}</span>
                )}
              </div>
              {plan.tasks.length > 0 && (
                <div className="mt-2 space-y-1 text-xs text-text-secondary">
                  {plan.tasks.map((task, taskIndex) => (
                    <div key={task.taskId ?? `${plan.planId ?? planIndex}:task-${taskIndex}`}>
                      {task.objective ?? task.taskId}
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
      {evidence.length > 0 && (
        <section className="mb-3 rounded-xl border border-border-light bg-surface-secondary/60 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-text-primary"><Radio className="h-4 w-4" aria-hidden="true" />Evidence</div>
          <div className="space-y-1 text-xs text-text-secondary">
            {evidence.slice(-8).map(({ traceId, observation }, index) => (
              <div key={`${traceId}:${observation.traceEventId ?? index}`} className="flex items-center justify-between gap-3">
                <span>{observation.type ?? 'EVENT'}</span>
                <span className="truncate text-right">{traceId}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {projectConversations.map((conversation) => (
          <ConversationTasks key={conversation.conversationId} conversation={conversation} />
        ))}
      </div>
    </section>
  );
}
