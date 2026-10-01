import { v4 } from 'uuid';
import { Button } from '@librechat/client';
import type { ParentSubagentSummary, TConversation } from 'librechat-data-provider';
import { subagentStatusDotClass, subagentStatusLabelKey } from '~/components/Chat/Subagents/status';
import { useParentSubagentsQuery, useSubagentControlMutation } from '~/data-provider';
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

export default function BotModeProjectPanel({ conversations }: { conversations: TConversation[] }) {
  const localize = useLocalize();
  const projectConversations = conversations.filter((conversation) => conversation.conversationId);

  if (projectConversations.length === 0) {
    return null;
  }

  return (
    <section className="mt-8" aria-label={localize('com_ui_bot_mode_project_activity')}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-text-primary">
          {localize('com_ui_bot_mode_project_activity')}
        </h2>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {projectConversations.map((conversation) => (
          <ConversationTasks key={conversation.conversationId} conversation={conversation} />
        ))}
      </div>
    </section>
  );
}
