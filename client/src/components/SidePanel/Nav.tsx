import type { NavLink } from '~/common';
import { useActivePanel, resolveActivePanel } from '~/Providers';
import ModeSwitcher from './ModeSwitcher';

export default function Nav({ links }: { links: NavLink[] }) {
  const { active } = useActivePanel();
  const effectiveActive = resolveActivePanel(active, links);
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden text-text-primary">
      <ModeSwitcher />
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {links.map((link) =>
          link.id === effectiveActive && link.Component ? <link.Component key={link.id} /> : null,
        )}
      </div>
    </div>
  );
}
