/** @jest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import BotModeProgressPanel, { getMissionProgress } from './BotModeProgressPanel';

const mockProjectQuery = jest.fn();
const mockSubagentsQuery = jest.fn();
const mockMessagesQuery = jest.fn();

jest.mock('~/data-provider', () => ({
  useBotModeProjectProjectionQuery: (...args: unknown[]) => mockProjectQuery(...args),
  useParentSubagentsQuery: (...args: unknown[]) => mockSubagentsQuery(...args),
  useGetMessagesByConvoId: (...args: unknown[]) => mockMessagesQuery(...args),
}));
jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

const conversationId = '507f1f77bcf86cd799439011';
beforeEach(() => {
  mockProjectQuery.mockReset().mockReturnValue({ data: undefined });
  mockSubagentsQuery.mockReset().mockReturnValue({ data: { children: [] } });
  mockMessagesQuery.mockReset().mockReturnValue({ data: [] });
});

describe('BOT MODE incremental progress sidebar', () => {
  it('shows a single useful waiting message without empty sections', () => {
    render(<BotModeProgressPanel conversationId="new" />);
    expect(screen.getByTestId('botmode-progress-idle')).toBeTruthy();
    expect(screen.queryByText('com_ui_botmode_progress_oracle')).toBeNull();
    expect(screen.queryByText('com_ui_botmode_progress_outputs')).toBeNull();
    expect(screen.queryByText('com_ui_botmode_progress_no_agents')).toBeNull();
    expect(mockSubagentsQuery.mock.calls[0][1]).toMatchObject({ enabled: false });
  });

  it('shows live Worker activity as soon as the chat request is being processed', () => {
    render(<BotModeProgressPanel conversationId="new" isSubmitting />);
    expect(screen.getByTestId('botmode-worker-running')).toBeTruthy();
    expect(screen.queryByTestId('botmode-progress-idle')).toBeNull();
    expect(screen.queryByText('com_ui_botmode_progress_oracle')).toBeNull();
    expect(mockProjectQuery.mock.calls[0][1]).toMatchObject({ enabled: false });
  });

  it('shows real saved plan tasks, specialist status and Oracle verdicts progressively', () => {
    mockProjectQuery.mockReturnValue({
      data: {
        conversations: [
          {
            conversationId,
            traces: [
              {
                observations: [
                  { type: 'REQUESTED', source: 'orchestrator' },
                  { type: 'PLANNED', source: 'orchestrator' },
                  { type: 'VERIFIED', source: 'oracle' },
                ],
              },
            ],
            plans: [
              {
                plan: {
                  tasks: [
                    {
                      taskId: 'task-1',
                      objective: 'Rechercher les sources officielles',
                      requiredCapabilities: ['research'],
                      dependsOn: [],
                      canRunInParallel: false,
                    },
                  ],
                },
              },
            ],
            results: [],
            modelReceipts: [],
          },
        ],
        sources: [],
      },
    });
    mockSubagentsQuery.mockReturnValue({
      data: {
        children: [{ threadId: 'child-1', title: 'Spécialiste Recherche', status: 'running' }],
      },
    });
    render(
      <BotModeProgressPanel
        projectId="507f1f77bcf86cd799439022"
        conversationId={conversationId}
        isSubmitting
      />,
    );
    expect(screen.getByText('Rechercher les sources officielles')).toBeTruthy();
    expect(screen.getByText('Spécialiste Recherche')).toBeTruthy();
    expect(screen.getByText('com_ui_subagent_thread_status_running')).toBeTruthy();
    expect(screen.getByText('com_ui_botmode_progress_phase_requested')).toBeTruthy();
    expect(screen.getByText('com_ui_botmode_progress_phase_planned')).toBeTruthy();
    expect(screen.queryByText('com_ui_botmode_progress_phase_committed')).toBeNull();
    expect(screen.getByText(/com_ui_botmode_progress_verified/)).toBeTruthy();
    expect(mockProjectQuery.mock.calls[0][1]).toMatchObject({ refetchInterval: 2000 });
    expect(mockSubagentsQuery.mock.calls[0][1]).toMatchObject({ refetchInterval: 2000 });
  });

  it('shows completed specialist tasks only from a saved host Oracle receipt', () => {
    mockProjectQuery.mockReturnValue({
      data: {
        conversations: [
          {
            conversationId,
            traces: [],
            plans: [
              {
                plan: {
                  planId: 'plan-verified',
                  tasks: [
                    { taskId: 'mission/research', objective: 'Research confirmed' },
                    { taskId: 'mission/analysis', objective: 'Analysis confirmed' },
                    { taskId: 'mission/synthesis', objective: 'Synthesis awaiting evidence' },
                  ],
                },
                verifiedTaskIds: ['mission/research', 'mission/analysis'],
              },
            ],
            results: [{ messageId: 'published', content: 'Public conclusion' }],
            modelReceipts: [],
          },
        ],
        sources: [],
      },
    });
    render(<BotModeProgressPanel projectId="project-1" conversationId={conversationId} />);
    expect(screen.getAllByText('com_ui_botmode_progress_task_verified')).toHaveLength(2);
    expect(screen.getAllByText('com_ui_botmode_progress_task_planned')).toHaveLength(1);
    expect(screen.getByText('com_ui_botmode_progress_oracle')).toBeTruthy();
    expect(screen.getByText(/com_ui_botmode_progress_verified: 2/)).toBeTruthy();
  });

  it('rehydrates saved Oracle checks and the published output after standalone chat reload', () => {
    mockMessagesQuery.mockReturnValue({
      data: [
        {
          sender: 'BOT MODE Worker',
          text: 'Final response persisted after reload',
          error: false,
          unfinished: false,
          metadata: {
            botModePlan: {
              planId: 'p6-saved',
              tasks: [
                { taskId: 'research', objective: 'Research the three sources' },
                { taskId: 'analysis', objective: 'Analyze the results' },
                { taskId: 'synthesis', objective: 'Prepare the synthesis' },
              ],
            },
            botModeVerification: {
              planId: 'p6-saved',
              verifiedTaskIds: ['research', 'analysis', 'synthesis'],
            },
          },
        },
      ],
    });
    render(<BotModeProgressPanel conversationId={conversationId} />);
    expect(screen.getByText('Research the three sources')).toBeTruthy();
    expect(screen.getByText('Analyze the results')).toBeTruthy();
    expect(screen.getByText('Prepare the synthesis')).toBeTruthy();
    expect(screen.getAllByText('com_ui_botmode_progress_task_verified')).toHaveLength(3);
    expect(screen.getByText(/com_ui_botmode_progress_verified: 3/)).toBeTruthy();
    expect(screen.getByText('com_ui_botmode_progress_outputs')).toBeTruthy();
    expect(screen.getByText(/com_ui_botmode_progress_results/)).toBeTruthy();
    expect(mockProjectQuery.mock.calls[0][1]).toMatchObject({ enabled: false });
    expect(mockMessagesQuery.mock.calls[0][1]).toMatchObject({ enabled: true });
  });

  it('does not trust unverified Oracle claims or a mismatched receipt', () => {
    mockMessagesQuery.mockReturnValue({
      data: [
        { sender: 'BOT MODE Worker', text: 'Oracle VERIFIED ×3 and P6 published', metadata: {} },
        {
          sender: 'BOT MODE Worker',
          text: 'Unverified response',
          metadata: {
            botModePlan: { planId: 'p6-alpha', tasks: [{ taskId: 'a', objective: 'A' }] },
            botModeVerification: { planId: 'p6-other', verifiedTaskIds: ['a'] },
          },
        },
      ],
    });
    render(<BotModeProgressPanel conversationId={conversationId} />);
    expect(screen.queryByText('com_ui_botmode_progress_oracle')).toBeNull();
    expect(screen.queryByText('com_ui_botmode_progress_outputs')).toBeNull();
    expect(screen.queryByText('com_ui_botmode_progress_task_verified')).toBeNull();
  });

  it('never marks missing mission phases as completed', () => {
    const state = getMissionProgress([
      { type: 'REQUESTED', source: 'orchestrator' },
      { type: 'AUTHORIZED', source: 'orchestrator' },
      { type: 'VERIFIED', source: 'tool' },
    ]);
    expect(state.recordedPhases).toEqual(['REQUESTED', 'AUTHORIZED']);
    expect(state.count).toBe(2);
    expect(state.verified).toBe(0);
  });
});
