import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { dataService } from 'librechat-data-provider';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SkillImprovementReview from './SkillImprovementReview';

jest.mock('@tanstack/react-query', () => ({ useQuery: jest.fn() }));
jest.mock('librechat-data-provider', () => ({
  dataService: { getSkillImprovementReview: jest.fn(), decideSkillImprovementReview: jest.fn() },
}));
jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));

function show(quality: 'VERIFIED' | 'PENDING') {
  (useQuery as jest.Mock).mockReturnValue({
    data: {
      candidateId: 'skill:task:call',
      skillId: 'skill-1',
      expectedVersion: 3,
      diff: '-old\n+Exact reviewed text',
      payloadDigest: 'digest-1',
      snapshotDigest: 'snapshot-1',
      quality,
      reviewed: false,
      checks: [{ id: 'content', passed: quality === 'VERIFIED' }],
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(async () => undefined),
  });
  return render(
    <MemoryRouter initialEntries={['/skills/improvements/skill%3Atask%3Acall']}>
      <Routes>
        <Route path="/skills/improvements/:candidateId" element={<SkillImprovementReview />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('exact skill improvement review UI', () => {
  beforeEach(() => jest.clearAllMocks());
  it('shows the exact diff and sends both digests with a deliberate approval', async () => {
    (dataService.decideSkillImprovementReview as jest.Mock).mockResolvedValue({
      status: 'updated',
    });
    show('VERIFIED');
    expect(screen.getByText(/Exact reviewed text/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_skill_improvement_approve' }));
    await waitFor(() =>
      expect(dataService.decideSkillImprovementReview).toHaveBeenCalledWith('skill:task:call', {
        decision: 'approve',
        payloadDigest: 'digest-1',
        snapshotDigest: 'snapshot-1',
      }),
    );
  });
  it('disables approval without server-verified quality while allowing rejection', () => {
    show('PENDING');
    expect(screen.getByRole('button', { name: 'com_ui_skill_improvement_approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'com_ui_skill_improvement_reject' })).toBeEnabled();
  });
});
