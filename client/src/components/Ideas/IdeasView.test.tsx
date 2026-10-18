import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { dataService } from 'librechat-data-provider';
import IdeasView from './IdeasView';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/data-provider', () => ({
  useBotModeProjectProjectionQuery: () => ({ data: undefined, isLoading: false }),
  useParentSubagentsQuery: () => ({ data: undefined }),
}));

jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  dataService: {
    ...jest.requireActual('librechat-data-provider').dataService,
    listIdeas: jest.fn(),
    listAgents: jest.fn(),
    createProject: jest.fn(),
    updateIdea: jest.fn(),
  },
}));

const idea = {
  _id: 'idea-one',
  title: 'Plan de recherche',
  content: 'Comparer les sources',
  projectId: '',
  status: 'new',
  priority: 'normal',
};

function renderIdeas() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <IdeasView />
    </QueryClientProvider>,
  );
}

describe('BOT MODE Ideas mission authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(dataService.listIdeas).mockResolvedValue({ ideas: [idea] } as never);
    jest.mocked(dataService.createProject).mockResolvedValue({ _id: 'project-one' } as never);
    jest.mocked(dataService.updateIdea).mockResolvedValue({} as never);
  });

  it('rejects unrelated agents without creating a project or changing the idea', async () => {
    jest.mocked(dataService.listAgents).mockResolvedValue({
      data: [{ id: 'unrelated', name: 'Other Agent' }],
    } as never);
    renderIdeas();
    fireEvent.click(await screen.findByRole('button', { name: 'com_ui_idea_analyze' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Worker BOT MODE');
    expect(dataService.listAgents).toHaveBeenCalledWith(
      expect.objectContaining({ requiredPermission: expect.any(Number) }),
    );
    expect(dataService.createProject).not.toHaveBeenCalled();
    expect(dataService.updateIdea).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('leaves project and idea unchanged when authorization lookup fails', async () => {
    jest.mocked(dataService.listAgents).mockRejectedValue(new Error('HTTP 403'));
    renderIdeas();
    fireEvent.click(await screen.findByRole('button', { name: 'com_ui_idea_analyze' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('autorisations');
    expect(dataService.createProject).not.toHaveBeenCalled();
    expect(dataService.updateIdea).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('selects the authorized Worker, never the first unrelated agent', async () => {
    jest.mocked(dataService.listAgents).mockResolvedValue({
      data: [
        { id: 'unrelated', name: 'Other Agent' },
        { id: 'authorized-worker', name: 'BOT MODE Worker' },
      ],
    } as never);
    renderIdeas();
    fireEvent.click(await screen.findByRole('button', { name: 'com_ui_idea_analyze' }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledTimes(1);
    });
    const path = mockNavigate.mock.calls[0][0] as string;
    expect(path).toContain('agent_id=authorized-worker');
    expect(path).not.toContain('agent_id=unrelated');
    expect(path).toContain('botmode=1');
    expect(dataService.createProject).toHaveBeenCalledTimes(1);
    expect(dataService.updateIdea).toHaveBeenCalledWith({
      ideaId: 'idea-one',
      status: 'in_analysis',
      projectId: 'project-one',
    });
  });
});
