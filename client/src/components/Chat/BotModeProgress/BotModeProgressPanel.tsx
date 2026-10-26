import { useCallback, useMemo } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  CheckCircle2,
  Circle,
  ClipboardList,
  FileText,
  LoaderCircle,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import type { TBotModeProjectObservation } from 'librechat-data-provider';
import {
  BOTMODE_TOOLS_RIGHT_HOST_ID,
  botModeToolsRightCountAtom,
  botModeToolsRightHostAtom,
} from '~/components/Chat/BotModeTools/state';
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

/** Do not infer completion of intermediate phases that lack durable evidence. */
export function getMissionProgress(observations: TBotModeProjectObservation[]) {
  const ordered = [...observations].sort((a, b) =>
    (a.timestamp ?? '').localeCompare(b.timestamp ?? ''),
  );
  const recorded = new Set<Phase>();
  const recordedPhases: Phase[] = [];
  for (const event of ordered) {
    if (MISSION_PHASES.includes(event.type as Phase) && !recorded.has(event.type as Phase)) {
      const phase = event.type as Phase;
      recorded.add(phase);
      recordedPhases.push(phase);
    }
  }
  const latest = recordedPhases.at(-1);
  const oracleEvents = observations.filter((item) => item.source === 'oracle');
  return {
    latest,
    count: recordedPhases.length,
    recorded,
    recordedPhases,
    verified: oracleEvents.filter((item) => item.type === 'VERIFIED').length,
    rejected: oracleEvents.filter((item) => item.type === 'REJECTED').length,
  };
}

export default function BotModeProgressPanel({
  projectId,
  conversationId,
  isSubmitting = false,
}: {
  projectId?: string | null;
  conversationId: string;
  isSubmitting?: boolean;
}) {
  const localize = useLocalize();
  const toolGroupCount = useAtomValue(botModeToolsRightCountAtom);
  const setRightHost = useSetAtom(botModeToolsRightHostAtom);
  const registerRightHost = useCallback(
    (node: HTMLDivElement | null) => setRightHost(node),
    [setRightHost],
  );
  const { data: project } = useBotModeProjectProjectionQuery(projectId, {
    enabled: Boolean(projectId),
    refetchInterval: isSubmitting ? 2_000 : 5_000,
    refetchIntervalInBackground: false,
  });
  const { data: subagents } = useParentSubagentsQuery(conversationId, {
    enabled: Boolean(conversationId) && conversationId !== 'new',
    refetchInterval: isSubmitting ? 2_000 : 5_000,
    refetchIntervalInBackground: false,
  });

  const current = project?.conversations.find((item) => item.conversationId === conversationId);
  const observations = useMemo(
    () => current?.traces.flatMap((trace) => trace.observations) ?? [],
    [current],
  );
  const progress = useMemo(() => getMissionProgress(observations), [observations]);
  const tasks = current?.plans.at(-1)?.plan.tasks ?? [];
  const children = subagents?.children ?? [];
  const results = current?.results.filter((item) => Boolean(item.content.trim())) ?? [];
  const sources = project?.sources ?? [];
  const receipts = current?.modelReceipts ?? [];
  const hasMissionStages =
    isSubmitting || progress.count > 0 || tasks.length > 0 || children.length > 0;
  const hasActivity =
    toolGroupCount > 0 ||
    isSubmitting ||
    progress.count > 0 ||
    tasks.length > 0 ||
    children.length > 0 ||
    results.length > 0 ||
    sources.length > 0 ||
    receipts.length > 0;

  return (
    <aside
      id="botmode-progress-sidebar"
      className="flex h-full min-h-0 flex-col bg-surface-primary text-text-primary"
      aria-label={localize('com_ui_botmode_progress_title')}
      data-testid="botmode-progress-sidebar"
    >
      <header className="shrink-0 border-b border-border-light px-5 py-4">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <ClipboardList className="h-4 w-4 text-blue-500" aria-hidden="true" />
          {localize('com_ui_botmode_progress_title')}
        </h2>
        {isSubmitting && (
          <p className="mt-1 text-xs text-blue-500" role="status">
            {localize('com_ui_botmode_progress_live')}
          </p>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 text-sm">
        <section
          className={toolGroupCount > 0 ? 'block' : 'hidden'}
          aria-label={localize('com_ui_botmode_tools_right_title')}
          data-testid="botmode-tools-right-section"
        >
          <h3 className="mb-3 flex items-center gap-2 font-semibold">
            <Wrench className="h-4 w-4 text-blue-500" aria-hidden="true" />
            {localize('com_ui_botmode_tools_right_title')}
          </h3>
          <div
            id={BOTMODE_TOOLS_RIGHT_HOST_ID}
            ref={registerRightHost}
            data-testid="botmode-tools-right-host"
            className="min-w-0 space-y-2"
          />
        </section>
        {!hasActivity ? (
          <p className="text-sm text-text-secondary" data-testid="botmode-progress-idle">
            {localize('com_ui_botmode_progress_waiting')}
          </p>
        ) : (
          <>
            {hasMissionStages && (
              <section aria-label={localize('com_ui_botmode_progress_stages')}>
                <h3 className="mb-3 font-semibold">{localize('com_ui_botmode_progress_stages')}</h3>
                <ol className="space-y-3 border-l border-border-medium pl-4" aria-live="polite">
                  {isSubmitting && (
                    <li className="flex items-start gap-2" data-testid="botmode-worker-running">
                      <LoaderCircle
                        className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-blue-500"
                        aria-hidden="true"
                      />
                      <span className="font-medium text-text-primary">
                        {localize('com_ui_botmode_progress_worker_running')}
                      </span>
                    </li>
                  )}
                  {progress.recordedPhases.map((phase) => (
                    <li key={phase} className="flex items-start gap-2">
                      <CheckCircle2
                        className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500"
                        aria-hidden="true"
                      />
                      <span className="text-text-secondary">{localize(PHASE_LABELS[phase])}</span>
                    </li>
                  ))}
                  {tasks.map((task, index) => (
                    <li key={task.taskId ?? index} className="flex items-start gap-2">
                      <Circle
                        className="mt-0.5 h-4 w-4 shrink-0 text-violet-500"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 text-text-secondary">
                        {task.objective || localize('com_ui_botmode_progress_untitled')}
                        <span className="mt-0.5 block text-xs text-text-tertiary">
                          {localize('com_ui_botmode_progress_task_planned')}
                        </span>
                      </span>
                    </li>
                  ))}
                  {children.map((child) => (
                    <li key={child.threadId} className="flex items-start gap-2">
                      <span
                        className={
                          'mt-1.5 h-2 w-2 shrink-0 rounded-full ' +
                          subagentStatusDotClass(child.status)
                        }
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{child.title}</span>
                        <span className="block text-xs text-text-secondary">
                          {localize(subagentStatusLabelKey(child.status))}
                        </span>
                      </span>
                    </li>
                  ))}
                  {progress.count === 0 &&
                    tasks.length === 0 &&
                    children.length === 0 &&
                    !isSubmitting && (
                      <li className="text-xs text-text-secondary">
                        {localize('com_ui_botmode_progress_no_stages')}
                      </li>
                    )}
                </ol>
              </section>
            )}

            {(progress.verified > 0 || progress.rejected > 0) && (
              <section aria-label={localize('com_ui_botmode_progress_oracle')}>
                <h3 className="mb-2 flex items-center gap-2 font-semibold">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" aria-hidden="true" />
                  {localize('com_ui_botmode_progress_oracle')}
                </h3>
                <p className="text-xs text-text-secondary">
                  {localize('com_ui_botmode_progress_verified')}: {progress.verified}
                  {progress.rejected > 0
                    ? ' · ' +
                      localize('com_ui_botmode_progress_rejected') +
                      ': ' +
                      progress.rejected
                    : null}
                </p>
              </section>
            )}

            {results.length > 0 && (
              <section aria-label={localize('com_ui_botmode_progress_outputs')}>
                <h3 className="mb-2 flex items-center gap-2 font-semibold">
                  <FileText className="h-4 w-4 text-violet-500" aria-hidden="true" />
                  {localize('com_ui_botmode_progress_outputs')}
                </h3>
                <p className="text-xs text-text-secondary">
                  {localize('com_ui_botmode_progress_results', { count: results.length })}
                </p>
              </section>
            )}

            {(sources.length > 0 || receipts.length > 0) && (
              <section aria-label={localize('com_ui_botmode_progress_resources')}>
                <h3 className="mb-2 font-semibold">
                  {localize('com_ui_botmode_progress_resources')}
                </h3>
                {sources.map((source, index) => (
                  <div
                    key={source.fileId ?? index}
                    className="truncate py-1 text-xs text-text-secondary"
                  >
                    {source.filename || localize('com_ui_botmode_progress_source')}
                  </div>
                ))}
                {receipts.map(({ messageId, receipt }, index) => (
                  <div
                    key={messageId ?? index}
                    className="truncate py-1 text-xs text-text-secondary"
                  >
                    {receipt.resolvedProvider ?? receipt.selectedProvider} ·{' '}
                    {receipt.resolvedModel ?? receipt.selectedModel}
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
