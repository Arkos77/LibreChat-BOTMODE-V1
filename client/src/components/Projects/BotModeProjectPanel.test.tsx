import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ParentSubagentIndex, TConversation } from 'librechat-data-provider';
import BotModeProjectPanel from './BotModeProjectPanel';

const mockUseParentSubagentsQuery = jest.fn();
const mockUseBotModeProjectProjectionQuery = jest.fn();
const mockControlMutate = jest.fn();

jest.mock('~/data-provider', () => ({
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
    expect(screen.getByText('AUTHORIZED')).toBeInTheDocument();
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
