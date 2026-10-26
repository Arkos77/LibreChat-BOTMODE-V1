import { memo, useEffect } from 'react';
import { Wrench } from 'lucide-react';
import { useAtomValue, useSetAtom } from 'jotai';
import type { NavLink } from '~/common';
import {
  BOTMODE_TOOLS_LEFT_HOST_ID,
  botModeToolsInSidebarAtom,
  botModeToolsSidebarExpandedAtom,
} from '~/components/Chat/BotModeTools/state';
import SidePanelNav from '~/components/SidePanel/Nav';
import ExpandedPanel from './ExpandedPanel';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

function Sidebar({
  links,
  expanded,
  width,
  minWidth,
  maxWidth,
  onCollapse,
  onExpand,
  onLeaveInsights,
  onResizeStart,
  onResizeKeyboard,
}: {
  links: NavLink[];
  expanded: boolean;
  width: number;
  minWidth: number;
  maxWidth: number;
  onCollapse: () => void;
  onExpand: () => void;
  onLeaveInsights: () => void;
  onResizeStart: (e: React.MouseEvent) => void;
  onResizeKeyboard: (direction: 'shrink' | 'grow') => void;
}) {
  const localize = useLocalize();
  const toolGroupCount = useAtomValue(botModeToolsInSidebarAtom);
  const setToolsExpanded = useSetAtom(botModeToolsSidebarExpandedAtom);

  useEffect(() => {
    setToolsExpanded(expanded);
    return () => setToolsExpanded(false);
  }, [expanded, setToolsExpanded]);

  return (
    <>
      <div className="flex h-full w-full overflow-hidden">
        <ExpandedPanel
          links={links}
          expanded={expanded}
          onCollapse={onCollapse}
          onExpand={onExpand}
          onLeaveInsights={onLeaveInsights}
        />
        <div
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col bg-surface-primary-alt',
            expanded ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
          style={{ transition: expanded ? 'opacity 200ms ease 80ms' : 'opacity 150ms ease' }}
          aria-hidden={!expanded}
        >
          <nav className="min-h-0 flex-1 overflow-hidden">
            <SidePanelNav links={links} />
          </nav>
          <section
            data-testid="botmode-tools-left-sidebar"
            aria-label={localize('com_ui_botmode_tools_left_title')}
            className={cn(
              'min-h-0 flex-col border-t border-border-medium bg-surface-primary-alt',
              expanded && toolGroupCount > 0 ? 'flex max-h-[48%] shrink-0' : 'hidden',
            )}
          >
            <h2 className="flex shrink-0 items-center gap-2 px-3 py-3 text-sm font-semibold text-text-primary">
              <Wrench className="h-4 w-4 text-blue-500" aria-hidden="true" />
              {localize('com_ui_botmode_tools_left_title')}
            </h2>
            <div
              id={BOTMODE_TOOLS_LEFT_HOST_ID}
              className="min-h-0 flex-1 overflow-y-auto px-3 pb-3"
              data-testid="botmode-tools-left-host"
            />
          </section>
        </div>
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-valuenow={Math.round(width)}
        aria-valuemin={Math.round(minWidth)}
        aria-valuemax={Math.round(maxWidth)}
        tabIndex={expanded ? 0 : -1}
        className={cn(
          'absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize transition-colors hover:bg-border-medium active:bg-border-heavy',
          expanded ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        style={{ transition: expanded ? 'opacity 200ms ease 80ms' : 'opacity 150ms ease' }}
        onMouseDown={onResizeStart}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            onResizeKeyboard('shrink');
          } else if (e.key === 'ArrowRight') {
            onResizeKeyboard('grow');
          }
        }}
      />
    </>
  );
}

export default memo(Sidebar);
