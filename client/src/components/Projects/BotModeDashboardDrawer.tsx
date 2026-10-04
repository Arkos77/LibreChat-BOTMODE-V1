import { Fragment, useState } from 'react';
import { Bot, X } from 'lucide-react';
import { Button } from '@librechat/client';
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import type { TConversation } from 'librechat-data-provider';
import BotModeProjectPanel from './BotModeProjectPanel';
import { useLocalize } from '~/hooks';

export default function BotModeDashboardDrawer({
  projectId,
  conversation,
}: {
  projectId?: string | null;
  conversation?: TConversation;
}) {
  const localize = useLocalize();
  const [open, setOpen] = useState(false);

  if (!projectId) {
    return null;
  }

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
            <DialogPanel className="fixed inset-y-0 right-0 flex w-full max-w-[460px] flex-col border-l border-border-light bg-surface-primary shadow-2xl">
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

              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
                <BotModeProjectPanel
                  projectId={projectId}
                  conversations={conversation ? [conversation] : []}
                  compact
                />
              </div>
            </DialogPanel>
          </TransitionChild>
        </Dialog>
      </Transition>
    </>
  );
}
