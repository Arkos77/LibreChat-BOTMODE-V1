import React from 'react';
import { dataService } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import IdeasView from './IdeasView';

const mockNavigate = jest.fn();
const mockUseBotModeProjectProjectionQuery = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/data-provider', () => ({
  useBotModeProjectProjectionQuery: (...args: unknown[]) =>
    mockUseBotModeProjectProjectionQuery(...args),
  useParentSubagentsQuery: () => ({ data: undefined }),
}));

jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  dataService: {
    ...jest.requireActual('librechat-data-provider').dataService,
    listIdeas: jest.fn(),
    listAgents: jest.fn(),
    getModels: jest.fn(),
    initializeBotModeAgents: jest.fn(),
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
    mockUseBotModeProjectProjectionQuery.mockReturnValue({ data: undefined, isLoading: false });
    jest.mocked(dataService.listIdeas).mockResolvedValue({ ideas: [idea] } as never);
    jest.mocked(dataService.getModels).mockResolvedValue({} as never);
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

  it('initializes a missing Worker only when one explicitly free model is configured', async () => {
    jest
      .mocked(dataService.listAgents)
      .mockResolvedValueOnce({ data: [{ id: 'unrelated', name: 'Other Agent' }] } as never)
      .mockResolvedValueOnce({ data: [{ id: 'new-worker', name: 'BOT MODE Worker' }] } as never);
    jest.mocked(dataService.getModels).mockResolvedValue({
      OpenRouter: ['openrouter/free', 'paid/model'],
    } as never);
    jest.mocked(dataService.initializeBotModeAgents).mockResolvedValue({
      capabilitiesComplete: true,
    } as never);
    renderIdeas();
    fireEvent.click(await screen.findByRole('button', { name: 'com_ui_idea_analyze' }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
    expect(dataService.initializeBotModeAgents).toHaveBeenCalledWith({
      provider: 'OpenRouter',
      model: 'openrouter/free',
    });
    expect(dataService.createProject).toHaveBeenCalledTimes(1);
    expect(mockNavigate.mock.calls[0][0]).toContain('agent_id=new-worker');
  });

  it('refuses a Worker initialized without its required capabilities', async () => {
    jest.mocked(dataService.listAgents).mockResolvedValueOnce({ data: [] } as never);
    jest.mocked(dataService.getModels).mockResolvedValue({
      OpenRouter: ['openrouter/free'],
    } as never);
    jest.mocked(dataService.initializeBotModeAgents).mockResolvedValue({
      capabilitiesComplete: false,
      missingCapabilities: [{ name: 'BOT MODE Worker', deniedTools: ['delegate'] }],
    } as never);
    renderIdeas();
    fireEvent.click(await screen.findByRole('button', { name: 'com_ui_idea_analyze' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('capacités');
    expect(dataService.initializeBotModeAgents).toHaveBeenCalledWith({
      provider: 'OpenRouter',
      model: 'openrouter/free',
    });
    expect(dataService.listAgents).toHaveBeenCalledTimes(1);
    expect(dataService.createProject).not.toHaveBeenCalled();
    expect(dataService.updateIdea).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('never auto-provisions a paid-only catalog on an idea mission', async () => {
    jest.mocked(dataService.listAgents).mockResolvedValue({ data: [] } as never);
    jest.mocked(dataService.getModels).mockResolvedValue({ Gemini: ['paid-model'] } as never);
    renderIdeas();
    fireEvent.click(await screen.findByRole('button', { name: 'com_ui_idea_analyze' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Worker BOT MODE');
    expect(dataService.initializeBotModeAgents).not.toHaveBeenCalled();
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

  it('renders a settled Oracle result directly in the linked Idea card', async () => {
    jest.mocked(dataService.listIdeas).mockResolvedValue({
      ideas: [{ ...idea, projectId: 'project-one', status: 'done' }],
    } as never);
    mockUseBotModeProjectProjectionQuery.mockImplementation((projectId: string) => ({
      isLoading: false,
      data:
        projectId === 'project-one'
          ? {
              projectId,
              conversations: [
                {
                  conversationId: 'conversation-one',
                  traces: [
                    {
                      observations: [
                        { traceEventId: 'settled-one', type: 'SETTLED', source: 'oracle' },
                      ],
                    },
                  ],
                  plans: [{ plan: { planVersion: 1, objective: 'Évaluer l’idée', tasks: [] } }],
                  results: [
                    {
                      messageId: 'message-final',
                      content: 'CI Oracle : résultat final publié dans la fiche Idée',
                    },
                  ],
                },
              ],
              sources: [],
            }
          : undefined,
    }));
    renderIdeas();
    expect(
      await screen.findByText('CI Oracle : résultat final publié dans la fiche Idée'),
    ).toBeVisible();
    expect(screen.getByText('com_ui_bot_mode_project_results')).toBeVisible();
    expect(screen.getByText('com_ui_bot_mode_idea_state_completed')).toBeVisible();
    expect(mockUseBotModeProjectProjectionQuery).toHaveBeenCalledWith(
      'project-one',
      expect.objectContaining({ enabled: true }),
    );
  });

  it('never displays a different project result on an unlinked Idea card', async () => {
    jest.mocked(dataService.listIdeas).mockResolvedValue({ ideas: [idea] } as never);
    mockUseBotModeProjectProjectionQuery.mockReturnValue({
      isLoading: false,
      data: {
        projectId: 'other-project',
        conversations: [
          {
            conversationId: 'unrelated-conversation',
            traces: [],
            plans: [],
            results: [{ messageId: 'unrelated', content: 'OTHER PROJECT CONFIDENTIAL RESULT' }],
          },
        ],
      },
    });
    renderIdeas();
    expect(await screen.findByText(idea.title)).toBeVisible();
    expect(screen.getByText('com_ui_bot_mode_idea_tracking_unavailable')).toBeVisible();
    expect(screen.queryByText('OTHER PROJECT CONFIDENTIAL RESULT')).not.toBeInTheDocument();
    expect(mockUseBotModeProjectProjectionQuery).toHaveBeenCalledWith(
      '',
      expect.objectContaining({ enabled: false }),
    );
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
