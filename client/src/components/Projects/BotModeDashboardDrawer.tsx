import { Fragment, useRef, useState } from 'react';
import { Button, FileUpload } from '@librechat/client';
import { EToolResources } from 'librechat-data-provider';
import { Bot, ChevronDown, FileText, Gauge, Paperclip, X } from 'lucide-react';
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import type { TConversation } from 'librechat-data-provider';
import { useBotModeBudgetQuery, useBotModeProjectProjectionQuery } from '~/data-provider';
import { useFileHandlingNoChatContext } from '~/hooks/Files';
import BotModeProjectPanel from './BotModeProjectPanel';
import { useChatContext } from '~/Providers';
import { useLocalize } from '~/hooks';

export default function BotModeDashboardDrawer({
  projectId,
  conversation,
  botMode = false,
}: {
  projectId?: string | null;
  conversation?: TConversation;
  botMode?: boolean;
}) {
  const localize = useLocalize();
  const chat = useChatContext();
  const [open, setOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeConversation = conversation ?? chat.conversation;
  const conversationId = activeConversation?.conversationId ?? '';
  const { data: projection } = useBotModeProjectProjectionQuery(projectId, {
    enabled: open && Boolean(projectId),
  });
  const { data: modelBudget } = useBotModeBudgetQuery({
    enabled: open,
  });

  const { handleFileChange } = useFileHandlingNoChatContext(undefined, {
    files: chat.files,
    setFiles: chat.setFiles,
    setFilesLoading: chat.setFilesLoading,
    conversation: activeConversation,
  });

  if (!botMode) {
    return null;
  }

  const projectedSources = projection?.sources ?? [];
  const sourceFiles = [
    ...projectedSources.map((source) => ({
      fileId: source.fileId,
      filename: source.filename,
      type: source.type,
    })),
    ...Array.from(chat.files.values())
      .filter((file) => file.file_id && (file.filename || file.file?.name))
      .map((file) => ({
        fileId: file.file_id,
        filename: file.filename ?? file.file?.name,
        type: file.type,
      })),
  ].filter(
    (source, index, all) =>
      source.fileId && all.findIndex((candidate) => candidate.fileId === source.fileId) === index,
  );

  const openSourcePicker = () => {
    if (!conversationId) {
      return;
    }
    inputRef.current?.click();
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label={localize('com_ui_bot_mode_dashboard_open')}
        title={localize('com_ui_bot_mode_dashboard_open')}
        className="rounded-lg text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
      >
        <Bot className="h-5 w-5" aria-hidden="true" />
      </Button>

      <FileUpload
        ref={inputRef}
        handleFileChange={(event) => {
          handleFileChange(event, EToolResources.file_search);
        }}
      >
        <span className="hidden" aria-hidden="true" />
      </FileUpload>

      <Transition appear show={open} as={Fragment}>
        <Dialog as="div" className="relative z-[60]" onClose={setOpen}>
          <TransitionChild
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/20" aria-hidden="true" />
          </TransitionChild>

          <TransitionChild
            enter="transform transition ease-out duration-200"
            enterFrom="translate-x-full"
            enterTo="translate-x-0"
            leave="transform transition ease-in duration-150"
            leaveFrom="translate-x-0"
            leaveTo="translate-x-full"
          >
            <DialogPanel className="fixed inset-y-0 right-0 flex w-full max-w-[480px] flex-col border-l border-border-light bg-surface-primary shadow-2xl">
              <DialogTitle
                as="div"
                className="flex shrink-0 items-center justify-between border-b border-border-light px-5 py-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-secondary text-text-primary">
                    <Bot className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-text-primary">
                      {localize('com_ui_bot_mode_dashboard_title')}
                    </div>
                    <div className="truncate text-xs text-text-secondary">
                      {localize('com_ui_bot_mode_dashboard_subtitle')}
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setOpen(false)}
                  aria-label={localize('com_ui_close')}
                  className="shrink-0 rounded-lg text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </Button>
              </DialogTitle>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <section className="border-b border-border-light px-5 py-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Gauge className="h-4 w-4 text-text-secondary" aria-hidden="true" />
                    <div>
                      <div className="text-sm font-semibold text-text-primary">
                        {localize('com_ui_bot_mode_budget_title')}
                      </div>
                      <div className="text-xs text-text-secondary">
                        {modelBudget?.enabled
                          ? localize(
                              modelBudget.spendingPolicy === 'free_only'
                                ? 'com_ui_bot_mode_budget_free_only'
                                : 'com_ui_bot_mode_budget_free_first',
                            )
                          : localize('com_ui_bot_mode_budget_disabled')}
                      </div>
                    </div>
                  </div>
                  {modelBudget && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl border border-border-light bg-surface-secondary/40 p-3">
                        <div className="text-xs text-text-secondary">
                          {localize('com_ui_bot_mode_budget_today')}
                        </div>
                        <div className="mt-1 text-base font-semibold tabular-nums text-text-primary">
                          {'$'}
                          {modelBudget.daily?.spentUsd.toFixed(2) ?? '0.00'}
                          {modelBudget.daily?.limitUsd != null
                            ? ' / $' + modelBudget.daily.limitUsd.toFixed(2)
                            : ''}
                        </div>
                      </div>
                      <div className="rounded-xl border border-border-light bg-surface-secondary/40 p-3">
                        <div className="text-xs text-text-secondary">
                          {localize('com_ui_bot_mode_budget_month')}
                        </div>
                        <div className="mt-1 text-base font-semibold tabular-nums text-text-primary">
                          {'$'}
                          {modelBudget.monthly?.spentUsd.toFixed(2) ?? '0.00'}
                          {modelBudget.monthly?.limitUsd != null
                            ? ' / $' + modelBudget.monthly.limitUsd.toFixed(2)
                            : ''}
                        </div>
                      </div>
                    </div>
                  )}
                </section>

                <section className="border-b border-border-light">
                  <button
                    type="button"
                    onClick={() => setSummaryOpen((value) => !value)}
                    className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-surface-hover/60"
                    aria-expanded={summaryOpen}
                  >
                    <div>
                      <div className="text-sm font-semibold text-text-primary">
                        {localize('com_ui_bot_mode_dashboard_summary')}
                      </div>
                      <div className="mt-0.5 text-xs text-text-secondary">
                        {localize('com_ui_bot_mode_dashboard_summary_hint')}
                      </div>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-text-secondary transition-transform ${
                        summaryOpen ? 'rotate-180' : ''
                      }`}
                      aria-hidden="true"
                    />
                  </button>

                  {summaryOpen && (
                    <div className="px-3 pb-4">
                      {projectId ? (
                        <BotModeProjectPanel
                          projectId={projectId}
                          conversations={conversation ? [conversation] : []}
                          compact
                          showSummary
                        />
                      ) : (
                        <div className="rounded-xl border border-dashed border-border-light px-4 py-5 text-sm text-text-secondary">
                          {localize('com_ui_bot_mode_dashboard_no_mission')}
                        </div>
                      )}
                    </div>
                  )}
                </section>

                <section className="px-5 py-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-text-primary">
                        {localize('com_ui_bot_mode_dashboard_sources')}
                      </div>
                      <div className="mt-0.5 text-xs text-text-secondary">
                        {localize('com_ui_bot_mode_dashboard_sources_hint')}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={openSourcePicker}
                      disabled={!conversationId}
                    >
                      <Paperclip className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      {localize('com_ui_bot_mode_dashboard_add_source')}
                    </Button>
                  </div>

                  {sourceFiles.length > 0 ? (
                    <div className="space-y-2">
                      {sourceFiles.map((file) => (
                        <div
                          key={file.fileId}
                          className="flex items-center gap-3 rounded-xl border border-border-light bg-surface-secondary/30 px-3 py-2.5"
                        >
                          <FileText
                            className="h-4 w-4 shrink-0 text-text-secondary"
                            aria-hidden="true"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm text-text-primary">
                              {file.filename ?? localize('com_file_unknown')}
                            </div>
                            <div className="text-[11px] text-text-tertiary">
                              {localize('com_ui_bot_mode_dashboard_source_ready')}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border-light px-4 py-6 text-center">
                      <FileText
                        className="mx-auto mb-2 h-5 w-5 text-text-tertiary"
                        aria-hidden="true"
                      />
                      <div className="text-sm text-text-secondary">
                        {localize('com_ui_bot_mode_dashboard_no_sources')}
                      </div>
                    </div>
                  )}
                </section>

                {projectId && (
                  <div className="px-3 pb-6">
                    <BotModeProjectPanel
                      projectId={projectId}
                      conversations={conversation ? [conversation] : []}
                      compact
                      showSummary={false}
                    />
                  </div>
                )}
              </div>
            </DialogPanel>
          </TransitionChild>
        </Dialog>
      </Transition>
    </>
  );
}
