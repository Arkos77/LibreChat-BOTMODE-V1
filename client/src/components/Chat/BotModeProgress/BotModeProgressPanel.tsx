import { useMemo } from 'react';
import {
  CheckCircle2,
  Circle,
  ClipboardList,
  FileText,
  GitBranch,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { TBotModeProjectObservation } from 'librechat-data-provider';
import { subagentStatusDotClass, subagentStatusLabelKey } from '~/components/Chat/Subagents/status';
import { useBotModeProjectProjectionQuery, useParentSubagentsQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';

export const MISSION_PHASES = [
  'REQUESTED',
  'PLANNED',
  'DECIDED',
  'AUTHORIZED',
  'COMMITTED',
  'SETTLED',
] as const;
type Phase = (typeof MISSION_PHASES)[number];

const PHASE_LABELS = {
  REQUESTED: 'com_ui_botmode_progress_phase_requested',
  PLANNED: 'com_ui_botmode_progress_phase_planned',
  DECIDED: 'com_ui_botmode_progress_phase_decided',
  AUTHORIZED: 'com_ui_botmode_progress_phase_authorized',
  COMMITTED: 'com_ui_botmode_progress_phase_committed',
  SETTLED: 'com_ui_botmode_progress_phase_settled',
} as const;

/** The checklist is driven by durable observations, never guessed completion. */
export function getMissionProgress(observations: TBotModeProjectObservation[]) {
  const recorded = new Set(
    observations.map((item) => item.type).filter((type): type is string => Boolean(type)),
  );
  const latest = [...observations]
    .reverse()
    .find((item) => MISSION_PHASES.includes(item.type as Phase))?.type;
  return {
    latest,
    count: latest ? MISSION_PHASES.indexOf(latest as Phase) + 1 : 0,
    recorded,
    verified: observations.filter(
      (item) => item.source === 'oracle' && item.type === 'VERIFIED',
    ).length,
    rejected: observations.filter(
      (item) => item.source === 'oracle' && item.type === 'REJECTED',
    ).length,
  };
}

export default function BotModeProgressPanel({
  projectId,
  conversationId,
}: {
  projectId?: string | null;
  conversationId: string;
}) {
  const localize = useLocalize();
  const { data: project } = useBotModeProjectProjectionQuery(projectId, {
    enabled: Boolean(projectId),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
  const { data: subagents } = useParentSubagentsQuery(conversationId, {
    enabled: Boolean(conversationId) && conversationId !== 'new',
  });
  const current = project?.conversations.find((item) => item.conversationId === conversationId);
  const observations = useMemo(
    () => current?.traces.flatMap((trace) => trace.observations) ?? [],
    [current],
  );
  const progress = useMemo(() => getMissionProgress(observations), [observations]);
  const tasks = current?.plans.at(-1)?.plan.tasks ?? [];
  const children = subagents?.children ?? [];
  const results = current?.results.filter((entry) => Boolean(entry.content.trim())) ?? [];
  const sources = project?.sources ?? [];
  const receipts = current?.modelReceipts ?? [];

  return (
    <aside
      className="flex h-full min-h-0 flex-col bg-surface-primary text-text-primary"
      aria-label={localize('com_ui_botmode_progress_title')}
      data-testid="botmode-progress-sidebar"
    >
      <header className="shrink-0 border-b border-border-light px-5 py-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <ClipboardList className="h-4 w-4 text-blue-500" aria-hidden="true" />
            {localize('com_ui_botmode_progress_title')}
          </h2>
          <p className="mt-1 text-xs text-text-secondary" role="status">
            {progress.count > 0
              ? localize('com_ui_botmode_progress_counter', {
                  count: progress.count,
                  total: MISSION_PHASES.length,
                })
              : localize('com_ui_botmode_progress_not_recorded')}
          </p>
        </div>
      </header>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 text-sm">
        <section aria-label={localize('com_ui_botmode_progress_stages')}>
          <h3 className="mb-3 font-semibold">{localize('com_ui_botmode_progress_stages')}</h3>
          {progress.count === 0 ? (
            <p className="text-xs text-text-secondary">
              {localize('com_ui_botmode_progress_not_recorded')}
            </p>
          ) : (
            <ol className="space-y-3 border-l border-border-medium pl-4">
              {MISSION_PHASES.map((phase) => {
                const recorded = progress.recorded.has(phase);
                const Icon = recorded ? CheckCircle2 : Circle;
                return (
                  <li key={phase} className="flex items-center gap-2">
                    <Icon
                      className={
                        'h-4 w-4 shrink-0 ' + (recorded ? 'text-emerald-500' : 'text-text-tertiary')
                      }
                      aria-hidden="true"
                    />
                    <span
                      className={
                        progress.latest === phase ? 'font-semibold' : 'text-text-secondary'
                      }
                    >
                      {localize(PHASE_LABELS[phase])}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {tasks.length > 0 && (
          <section aria-label={localize('com_ui_botmode_progress_plan')}>
            <h3 className="mb-3 flex items-center gap-2 font-semibold">
              <GitBranch className="h-4 w-4 text-violet-500" aria-hidden="true" />
              {localize('com_ui_botmode_progress_plan')} ({tasks.length})
            </h3>
            <ol className="space-y-2">
              {tasks.map((task, i) => (
                <li
                  key={task.taskId ?? i}
                  className="rounded-lg border border-border-light p-2.5 text-xs"
                >
                  {task.objective || localize('com_ui_botmode_progress_untitled')}
                </li>
              ))}
            </ol>
          </section>
        )}

        <section aria-label={localize('com_ui_botmode_progress_agents')}>
          <h3 className="mb-3 flex items-center gap-2 font-semibold">
            <Users className="h-4 w-4 text-blue-500" aria-hidden="true" />
            {localize('com_ui_botmode_progress_agents')}
          </h3>
          {children.length > 0 ? (
            <ol className="space-y-2">
              {children.map((child) => (
                <li key={child.threadId} className="flex items-start gap-2 text-xs">
                  <span
                    className={
                      'mt-1.5 h-2 w-2 shrink-0 rounded-full ' + subagentStatusDotClass(child.status)
                    }
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">{child.title}</span>
                  <span className="shrink-0 text-text-secondary">
                    {localize(subagentStatusLabelKey(child.status))}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-text-secondary">
              {localize('com_ui_botmode_progress_no_agents')}
            </p>
          )}
        </section>

        <section aria-label={localize('com_ui_botmode_progress_oracle')}>
          <h3 className="mb-2 flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-4 w-4 text-emerald-500" aria-hidden="true" />
            {localize('com_ui_botmode_progress_oracle')}
          </h3>
          <p className="text-xs text-text-secondary">
            {localize('com_ui_botmode_progress_verified')}: {progress.verified}
            {progress.rejected > 0
              ? ' · ' + localize('com_ui_botmode_progress_rejected') + ': ' + progress.rejected
              : null}
          </p>
        </section>

        <section aria-label={localize('com_ui_botmode_progress_outputs')}>
          <h3 className="mb-2 flex items-center gap-2 font-semibold">
            <FileText className="h-4 w-4 text-violet-500" aria-hidden="true" />
            {localize('com_ui_botmode_progress_outputs')}
          </h3>
          <p className="text-xs text-text-secondary">
            {results.length > 0
              ? localize('com_ui_botmode_progress_results', { count: results.length })
              : localize('com_ui_botmode_progress_no_outputs')}
          </p>
        </section>

        {(sources.length > 0 || receipts.length > 0) && (
          <section aria-label={localize('com_ui_botmode_progress_resources')}>
            <h3 className="mb-2 font-semibold">{localize('com_ui_botmode_progress_resources')}</h3>
            {sources.map((source, i) => (
              <div key={source.fileId ?? i} className="truncate py-1 text-xs text-text-secondary">
                {source.filename || localize('com_ui_botmode_progress_source')}
              </div>
            ))}
            {receipts.map(({ messageId, receipt }, i) => (
              <div key={messageId ?? i} className="truncate py-1 text-xs text-text-secondary">
                {receipt.resolvedProvider ?? receipt.selectedProvider} ·{' '}
                {receipt.resolvedModel ?? receipt.selectedModel}
              </div>
            ))}
          </section>
        )}
      </div>
    </aside>
  );
}
