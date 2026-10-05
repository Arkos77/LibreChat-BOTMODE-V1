import { useLocation } from 'react-router-dom';
import { BriefcaseBusiness, MessagesSquare } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export default function ModeSwitcher() {
  const localize = useLocalize();
  const location = useLocation();

  const workActive =
    location.pathname.startsWith('/projects') || location.pathname.startsWith('/ideas');
  const chatActive = !workActive && !location.pathname.startsWith('/insights');

  return (
    <div className="px-3 pb-2 pt-2">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-secondary p-1">
        <a
          href="/c/new"
          aria-current={chatActive ? 'page' : undefined}
          className={cn(
            'flex h-8 items-center justify-center gap-2 rounded-lg px-2 text-xs font-medium transition-colors',
            chatActive
              ? 'bg-surface-primary text-text-primary shadow-sm'
              : 'text-text-secondary hover:text-text-primary',
          )}
        >
          <MessagesSquare className="h-4 w-4" aria-hidden="true" />
          {localize('com_ui_chat')}
        </a>
        <a
          href="/projects"
          aria-current={workActive ? 'page' : undefined}
          className={cn(
            'flex h-8 items-center justify-center gap-2 rounded-lg px-2 text-xs font-medium transition-colors',
            workActive
              ? 'bg-surface-primary text-text-primary shadow-sm'
              : 'text-text-secondary hover:text-text-primary',
          )}
        >
          <BriefcaseBusiness className="h-4 w-4" aria-hidden="true" />
          {localize('com_ui_work')}
        </a>
      </div>
    </div>
  );
}
