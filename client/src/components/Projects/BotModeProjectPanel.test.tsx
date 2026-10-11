import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ParentSubagentIndex, TConversation } from 'librechat-data-provider';
import BotModeProjectPanel from './BotModeProjectPanel';

const mockUseParentSubagentsQuery = jest.fn();
const mockUseBotModeProjectProjectionQuery = jest.fn();
const mockControlMutate = jest.fn();
const mockUseListAgentsQuery = jest.fn();
const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('~/data-provider', () => ({
  useListAgentsQuery: () => mockUseListAgentsQuery(),
  useParentSubagentsQuery: (...args: unknown[]) => mockUseParentSubagentsQuery(...args),
  useBotModeProjectProjectionQuery: (...args: unknown[]) =>
    mockUseBotModeProjectProjectionQuery(...args),
  useSubagentControlMutation: () => ({
    mutate: (variables: unknown) => mockControlMutate(variables),
    isLoading: false,
  }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('uuid', () => ({
  v4: () => 'invocation-fixed',
}));

const conversationA = {
  conversationId: 'conversation-a',
  title: 'Project A task',
} as TConversation;

const conversationB = {
  conversationId: 'conversation-b',
  title: 'Project B task',
} as TConversation;

const withoutId = {
  title: 'Ignore me',
} as TConversation;

const indexes: Record<string, ParentSubagentIndex> = {
  'conversation-a': {
    parentConversationId: 'conversation-a',
    children: [
      {
        threadId: 'thread-a',
        parentMessageId: 'message-a',
        subagentType: 'research',
        subagentKind: 'agent',
        title: 'Research A',
        origin: 'tool',
        status: 'running',
        latestTaskId: 'task-a',
        tasks: [{ taskId: 'task-a', status: 'running' }],
        tasksTruncated: false,
      },
    ],
    childrenTruncated: false,
  },
  'conversation-b': {
    parentConversationId: 'conversation-b',
    children: [
      {
        threadId: 'thread-b',
        parentMessageId: 'message-b',
        subagentType: 'analysis',
        subagentKind: 'agent',
        title: 'Analysis B',
        origin: 'tool',
        status: 'paused',
        latestTaskId: 'task-b',
        tasks: [{ taskId: 'task-b', status: 'paused' }],
        tasksTruncated: false,
      },
    ],
    childrenTruncated: false,
  },
};

describe('BotModeProjectPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseListAgentsQuery.mockReturnValue({
      data: { data: [{ id: 'agent-worker', name: 'BOT MODE Worker' }] },
    });
    mockUseParentSubagentsQuery.mockImplementation((conversationId: string) => ({
      data: indexes[conversationId],
    }));
    mockUseBotModeProjectProjectionQuery.mockReturnValue({
      data: {
        projectId: 'project-a',
        conversations: [
          {
            conversationId: 'conversation-a',
            usage: {
              input: 10,
              output: 4,
              cacheWrite: 1,
              cacheRead: 2,
              cost: 0.25,
              costKnown: true,
            },
            traces: [
              {
                messageId: 'message-a',
                traceId: 'trace-a',
                observations: [
                  {
                    traceId: 'trace-a',
                    traceEventId: 'trace-a-authorized',
                    type: 'AUTHORIZED',
                    source: 'host',
                    timestamp: '2026-10-02T19:00:00.000Z',
                    payload: { decision: 'ALLOW' },
                  },
                ],
              },
            ],
            plans: [
              {
                messageId: 'message-a',
                plan: {
                  planId: 'plan-a',
                  planVersion: 2,
                  strategy: 'PARALLEL',
                  objective: 'Deliver project A',
                  tasks: [
                    {
                      taskId: 'root-a/research',
                      parentTaskId: 'root-a',
                      objective: 'Research sources',
                      requiredCapabilities: ['research'],
                      dependsOn: [],
                      canRunInParallel: true,
                    },
                  ],
                },
              },
            ],
          },
        ],
        memories: [
          {
            id: 'memory-a',
            key: 'project-focus',
            value: 'Only Project A',
            updatedAt: '2026-10-02T00:00:00.000Z',
          },
        ],
        sources: [
          {
            fileId: 'file-a',
            filename: 'research-a.pdf',
            type: 'application/pdf',
            size: 1234,
          },
        ],
        totals: {
          input: 10,
          output: 4,
          cacheWrite: 1,
          cacheRead: 2,
          cost: 0.25,
          costKnown: true,
        },
        nextCursor: null,
      },
    });
  });

  it('does not launch when only unrelated agents are accessible', () => {
    mockUseListAgentsQuery.mockReturnValue({
      data: { data: [{ id: 'another-agent', name: 'Other Agent' }] },
    });
    render(<BotModeProjectPanel projectId="project-a" conversations={[]} />);
    expect(screen.getByRole('button', { name: 'com_ui_bot_mode_project_launch' })).toBeDisabled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('selects the BOT MODE Worker instead of the first listed agent', () => {
    mockUseListAgentsQuery.mockReturnValue({
      data: {
        data: [
          { id: 'another-agent', name: 'Other Agent' },
          { id: 'agent-worker', name: 'BOT MODE Worker' },
        ],
      },
    });
    render(<BotModeProjectPanel projectId="project-a" conversations={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_bot_mode_project_launch' }));
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('agent_id=agent-worker'));
  });

  it('shows the durable SETTLED state when terminal evidence is present', () => {
    mockUseBotModeProjectProjectionQuery.mockReturnValue({
      data: {
        projectId: 'project-a',
        conversations: [
          {
            conversationId: 'conversation-a',
            usage: {
              input: 1,
              output: 1,
              cacheWrite: 0,
              cacheRead: 0,
              cost: 0,
              costKnown: true,
            },
            traces: [
              {
                messageId: 'message-a',
                traceId: 'trace-settled',
                observations: [
                  {
                    traceId: 'trace-settled',
                    traceEventId: 'trace-verified',
                    type: 'VERIFIED',
                    source: 'oracle',
                    timestamp: '2026-10-04T10:00:00.000Z',
                  },
                  {
                    traceId: 'trace-settled',
                    traceEventId: 'trace-settled-terminal',
                    type: 'SETTLED',
                    source: 'host',
                    timestamp: '2026-10-04T10:01:00.000Z',
                  },
                ],
              },
            ],
            plans: [],
          },
        ],
        totals: {
          input: 1,
          output: 1,
          cacheWrite: 0,
          cacheRead: 0,
          cost: 0,
          costKnown: true,
        },
        nextCursor: null,
      },
    });

    render(<BotModeProjectPanel projectId="project-a" conversations={[conversationA]} />);

    expect(
      screen.getByRole('heading', { name: 'com_ui_bot_mode_project_state_settled' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('bot-mode-project-state')).toHaveTextContent('6/6');
  });

  it('keeps project task queries isolated and controls the addressed durable task', () => {
    render(
      <BotModeProjectPanel
        projectId="project-a"
        conversations={[conversationA, conversationB, withoutId]}
      />,
    );

    expect(mockUseBotModeProjectProjectionQuery).toHaveBeenCalledWith(
      'project-a',
      expect.objectContaining({ enabled: true }),
    );
    expect(screen.getByText('$0.25')).toBeInTheDocument();
    expect(screen.getAllByText('AUTHORIZED').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('trace-a')).toBeInTheDocument();
    expect(screen.getByText('Deliver project A')).toBeInTheDocument();
    expect(screen.getByText('PARALLEL')).toBeInTheDocument();
    expect(screen.getByText('Research sources')).toBeInTheDocument();

    expect(mockUseParentSubagentsQuery).toHaveBeenCalledTimes(2);
    expect(mockUseParentSubagentsQuery).toHaveBeenNthCalledWith(
      1,
      'conversation-a',
      expect.objectContaining({ enabled: true }),
    );
    expect(mockUseParentSubagentsQuery).toHaveBeenNthCalledWith(
      2,
      'conversation-b',
      expect.objectContaining({ enabled: true }),
    );

    expect(
      screen.getByRole('button', { name: 'com_ui_bot_mode_project_launch' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_bot_mode_project_launch' }));
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringMatching(
        /\/c\/new\?projectId=project-a&agent_id=agent-worker&prompt=.*&submit=true&botmode=1&botmode_mode=analyze/,
      ),
    );

    expect(screen.getByText('Research A')).toBeInTheDocument();
    expect(screen.getByText('Analysis B')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_subagent_pause_task' }));
    expect(mockControlMutate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        parentConversationId: 'conversation-a',
        threadId: 'thread-a',
        command: {
          taskId: 'task-a',
          invocationId: 'invocation-fixed',
          action: 'pause',
        },
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_subagent_resume_task' }));
    expect(mockControlMutate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        parentConversationId: 'conversation-b',
        threadId: 'thread-b',
        command: {
          taskId: 'task-b',
          invocationId: 'invocation-fixed',
          action: 'resume',
        },
      }),
    );
  });
});
