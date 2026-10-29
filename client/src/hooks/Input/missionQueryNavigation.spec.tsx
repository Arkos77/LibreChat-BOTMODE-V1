import { act, renderHook } from '@testing-library/react';
import { EModelEndpoint } from 'librechat-data-provider';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import useQueryParams from './useQueryParams';

const mockSubmit = jest.fn();
const mockNewConversation = jest.fn();
const mockConversation = { endpoint: EModelEndpoint.agents, agent_id: 'worker' };
const mockMethods = {
  setValue: jest.fn(),
  handleSubmit: (callback: (data: { text: string }) => void) => () =>
    callback({ text: 'Investigate' }),
};
jest.mock('recoil', () => ({ ...jest.requireActual('recoil'), useRecoilValue: () => [] }));
jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ isAuthenticated: true }),
  useAgentsMap: () => ({}),
  useDefaultConvo: () => jest.fn(),
  useSubmitMessage: () => ({ submitMessage: mockSubmit }),
}));
jest.mock('~/Providers', () => ({
  useChatContext: () => ({ conversation: mockConversation, newConversation: mockNewConversation }),
  useChatFormContext: () => mockMethods,
}));
jest.mock('~/data-provider', () => ({
  startupConfigKey: () => ['startupConfig'],
  useGetAgentByIdQuery: () => ({ data: null }),
}));

describe('BOT MODE composer URL cleanup', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });
  afterEach(() => jest.useRealTimers());

  it.each([
    ['auto', false],
    ['manual', false],
    ['auto', true],
    ['manual', true],
  ])('keeps %s mission selection after cleanup (auto-submit: %s)', (mode, submit) => {
    const bindings = JSON.stringify([{ id: 'research', name: 'RECHERCHE' }]);
    const params = new URLSearchParams({
      botmode: '1',
      botmode_mode: 'analyze',
      botmode_agent_mode: String(mode),
      botmode_agent_bindings: bindings,
      agent_id: 'worker',
      projectId: 'project-1',
      prompt: 'Investigate',
      submit: String(submit),
    });
    const client = new QueryClient();
    client.setQueryData(['startupConfig'], { interface: { autoSubmitFromUrl: true } });
    const textAreaRef = { current: document.createElement('textarea') };
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/c/new?' + params.toString()]}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
    const { result } = renderHook(
      () => {
        useQueryParams({ textAreaRef });
        return useLocation();
      },
      { wrapper },
    );
    act(() => {
      jest.advanceTimersByTime(100);
    });
    if (submit) {
      expect(mockSubmit).not.toHaveBeenCalled();
      act(() => {
        jest.advanceTimersByTime(3100);
      });
      expect(mockSubmit).toHaveBeenCalledTimes(1);
    }
    const retained = new URLSearchParams(result.current.search);
    expect(retained.get('botmode')).toBe('1');
    expect(retained.get('botmode_mode')).toBe('analyze');
    expect(retained.get('botmode_agent_mode')).toBe(mode);
    expect(retained.get('botmode_agent_bindings')).toBe(bindings);
    expect(retained.get('projectId')).toBe('project-1');
    expect(retained.has('prompt')).toBe(false);
    expect(retained.has('submit')).toBe(false);
    act(() => {
      jest.advanceTimersByTime(10000);
    });
    expect(mockSubmit).toHaveBeenCalledTimes(submit ? 1 : 0);
  });
});
