/** @jest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import BotModeProgressPanel, { getMissionProgress } from './BotModeProgressPanel';

const mockProjectQuery = jest.fn();
const mockSubagentsQuery = jest.fn();

jest.mock('~/data-provider', () => ({
  useBotModeProjectProjectionQuery: (...args: unknown[]) => mockProjectQuery(...args),
  useParentSubagentsQuery: (...args: unknown[]) => mockSubagentsQuery(...args),
}));
jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

const conversationId = '507f1f77bcf86cd799439011';
beforeEach(() => {
  mockProjectQuery.mockReset().mockReturnValue({ data: undefined });
  mockSubagentsQuery.mockReset().mockReturnValue({ data: { children: [] } });
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
