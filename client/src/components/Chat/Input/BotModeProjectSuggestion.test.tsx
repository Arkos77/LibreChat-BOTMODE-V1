/** @jest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import BotModeProjectSuggestion, { shouldSuggestBotModeProject } from './BotModeProjectSuggestion';

const mockSetConversation = jest.fn();
const mockSetSearchParams = jest.fn();
let mockProjectParam: string | null = null;
let mockAgentName = 'BOT MODE Worker';
let mockDialogProps: {
  open: boolean;
  onCreated: (project: { _id: string }) => void;
  initialName: string;
  initialDescription: string;
} | null = null;

jest.mock('~/Providers', () => ({
  useChatContext: () => ({ setConversation: mockSetConversation }),
  useAgentsMapContext: () => ({ worker: { id: 'worker', name: mockAgentName } }),
}));

jest.mock('react-router-dom', () => ({
  useSearchParams: () => [
    new URLSearchParams(mockProjectParam ? { projectId: mockProjectParam } : {}),
    mockSetSearchParams,
  ],
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/components/Projects/ProjectCreateDialog', () => ({
  __esModule: true,
  default: (props: typeof mockDialogProps) => {
    mockDialogProps = props;
    return <div data-testid="project-create-dialog">{props?.open ? 'OPEN' : 'CLOSED'}</div>;
  },
}));

const longTask =
  'Développe-moi une application complète de gestion de stock avec suivi des inventaires et tests.';
const workerConversation = { agent_id: 'worker', conversationId: 'new' } as any;

function dialogProps() {
  if (!mockDialogProps) {
    throw new Error('Project create dialog not rendered');
  }
  return mockDialogProps;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockProjectParam = null;
  mockAgentName = 'BOT MODE Worker';
  mockDialogProps = null;
});

describe('local BOT MODE project hint', () => {
  test('does not suggest a project for a simple question or a how-to question', () => {
    expect(shouldSuggestBotModeProject('Quelle est la météo ?')).toBe(false);
    expect(shouldSuggestBotModeProject('Comment créer une application complète ?')).toBe(false);
  });

  test('suggests for long multi-step work in French, without a provider call', () => {
    expect(shouldSuggestBotModeProject(longTask)).toBe(true);
    expect(
      shouldSuggestBotModeProject(
        'Build a complete website and application for the business with user accounts and reports.',
      ),
    ).toBe(true);
  });

  test('displays the opt-in prompt only for BOT MODE Worker', () => {
    const { rerender } = render(
      <BotModeProjectSuggestion text={longTask} conversation={workerConversation} />,
    );
    expect(screen.getByRole('note')).toBeInTheDocument();
    mockAgentName = 'RECHERCHE';
    rerender(<BotModeProjectSuggestion text={longTask} conversation={workerConversation} />);
    expect(screen.queryByRole('note')).toBeNull();
  });

  test('never displays while project-scoped', () => {
    mockProjectParam = '507f1f77bcf86cd799439011';
    render(<BotModeProjectSuggestion text={longTask} conversation={workerConversation} />);
    expect(screen.queryByRole('note')).toBeNull();
  });

  test('continuing in Chat does not create or select a project', () => {
    render(<BotModeProjectSuggestion text={longTask} conversation={workerConversation} />);
    fireEvent.click(screen.getByText('com_ui_botmode_continue_chat'));
    expect(screen.queryByRole('note')).toBeNull();
    expect(mockSetConversation).not.toHaveBeenCalled();
    expect(mockSetSearchParams).not.toHaveBeenCalled();
  });

  test('user-confirmed creation scopes the same chat without replacing the draft', () => {
    render(<BotModeProjectSuggestion text={longTask} conversation={workerConversation} />);
    fireEvent.click(screen.getByText('com_ui_botmode_project_create'));
    expect(dialogProps().open).toBe(true);
    expect(dialogProps().initialDescription).toBe(longTask);
    dialogProps().onCreated({ _id: '507f1f77bcf86cd799439011' });
    expect(mockSetConversation).toHaveBeenCalledWith({
      ...workerConversation,
      chatProjectId: '507f1f77bcf86cd799439011',
    });
    const [params, options] = mockSetSearchParams.mock.calls[0];
    expect(params.get('projectId')).toBe('507f1f77bcf86cd799439011');
    expect(options).toMatchObject({ replace: true, flushSync: true });
  });
});
