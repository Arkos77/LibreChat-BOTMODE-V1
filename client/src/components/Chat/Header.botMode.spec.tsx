import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { EModelEndpoint } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import Header from './Header';

jest.mock('recoil', () => ({ useRecoilValue: () => false }));
jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    conversationAgentIdByIndex: () => 'agent',
    sidebarExpanded: 'sidebar',
  },
}));
jest.mock('~/hooks', () => ({
  useHasAccess: () => false,
  useLocalize: () => (key: string) => key,
}));
jest.mock('~/Providers', () => ({
  useAgentsMapContext: () => ({ worker: { name: 'BOT MODE Worker' } }),
}));
jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: { interface: {} } }),
  useGetAgentByIdQuery: () => ({ data: undefined }),
}));
jest.mock('./Menus', () => ({
  OpenSidebar: () => null,
  PresetsMenu: () => null,
  NewChat: () => null,
  HeaderMenu: () => null,
}));
jest.mock('./TemporaryChat', () => ({
  TemporaryChat: () => null,
  TemporaryChatIndicator: () => null,
}));
jest.mock('./Menus/Endpoints/ModelSelector', () => () => null);
jest.mock('./ExportAndShareMenu', () => () => null);
jest.mock('./SubagentThreadLink', () => () => null);
jest.mock('./Menus/BookmarkMenu', () => () => null);
jest.mock('./AddMultiConvo', () => () => null);
jest.mock('~/components/Projects/BotModeDashboardDrawer', () => () => null);

const conversation: TConversation = {
  conversationId: 'saved',
  endpoint: EModelEndpoint.agents,
  agent_id: 'worker',
  title: 'Mission',
  createdAt: '',
  updatedAt: '',
};

describe('visible BOT MODE conversation mode', () => {
  it('shows automatic mode before a prompt-selected mode is admitted', () => {
    render(
      <MemoryRouter initialEntries={['/c/saved?botmode=1']}>
        <Header conversation={conversation} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('com_ui_botmode_mode_auto');
  });
  it('shows the saved admitted mode with only a BOT MODE flag in the URL', () => {
    render(
      <MemoryRouter initialEntries={['/c/saved?botmode=1']}>
        <Header
          conversation={{
            ...conversation,
            botMode: {
              version: 1,
              mode: 'analyze',
              selectionMode: 'auto',
              workerAgentId: 'worker',
              agents: [{ id: 'research', name: 'RECHERCHE' }],
            },
          }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('com_ui_botmode_mode_analyze');
  });
  it('does not label a legacy Worker chat as an active mission', () => {
    render(
      <MemoryRouter initialEntries={['/c/saved']}>
        <Header conversation={conversation} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
