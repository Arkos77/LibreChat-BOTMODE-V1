import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { Constants, EModelEndpoint } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { EventSubmission, TMessage } from 'librechat-data-provider';
import type { PropsWithChildren } from 'react';
import { shouldUseBotModeMission } from '~/hooks/Chat/useChatFunctions';
import useEventHandlers from '../useEventHandlers';

jest.mock('recoil', () => ({
  ...jest.requireActual('recoil'),
  useSetRecoilState: () => jest.fn(),
  useRecoilCallback: () => jest.fn(),
}));
jest.mock('~/Providers', () => ({ useLiveAnnouncer: () => ({ announcePolite: jest.fn() }) }));
jest.mock('~/hooks/AuthContext', () => ({ useAuthContext: () => ({ token: null }) }));
jest.mock('~/hooks/Agents', () => ({ useApplyAgentTemplate: () => jest.fn() }));
jest.mock('../useContentHandler', () => () => ({}));
jest.mock('../useAttachmentHandler', () => () => jest.fn());
jest.mock('../useStepHandler', () => () => ({
  resetSubagentAtoms: jest.fn(),
  resetPtcAtoms: jest.fn(),
}));
jest.mock('~/data-provider', () => ({
  startupConfigKey: () => ['startupConfig'],
  queueTitleGeneration: jest.fn(),
  markTitleGenerationProcessed: jest.fn(),
}));

const selection = new URLSearchParams({
  botmode: '1',
  botmode_mode: 'analyze',
  botmode_agent_mode: 'manual',
  botmode_agent_bindings: JSON.stringify([{ id: 'research-agent', name: 'RECHERCHE' }]),
  agent_id: 'worker-agent',
});

function setup(search = selection.toString(), pathname = '/c/new') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const userMessage = {
    messageId: 'request',
    parentMessageId: Constants.NO_PARENT,
    conversationId: 'saved-mission',
    text: 'Research the request',
    isCreatedByUser: true,
  } as TMessage;
  const responseMessage = {
    messageId: 'response',
    parentMessageId: userMessage.messageId,
    conversationId: 'saved-mission',
    text: 'A verified answer',
    content: [{ type: 'text', text: 'A verified answer' }],
    isCreatedByUser: false,
    unfinished: false,
  } as TMessage;
  const submission = {
    conversation: {
      conversationId: Constants.NEW_CONVO,
      endpoint: EModelEndpoint.agents,
      agent_id: 'worker-agent',
    },
    userMessage,
    initialResponse: { ...responseMessage, text: '', content: [] },
    messages: [],
    isTemporary: false,
    endpointOption: { endpoint: EModelEndpoint.agents },
  } as EventSubmission;
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[pathname + (search ? '?' + search : '')]}>
        {children}
      </MemoryRouter>
    </QueryClientProvider>
  );
  const hook = renderHook(
    () => ({
      handlers: useEventHandlers({
        setMessages: jest.fn(),
        getMessages: () => [userMessage, responseMessage],
        setCompleted: jest.fn(),
        setConversation: jest.fn(),
        setIsSubmitting: jest.fn(),
        setShowStopButton: jest.fn(),
      }),
      location: useLocation(),
    }),
    { wrapper },
  );
  return { ...hook, submission, userMessage, responseMessage };
}

describe('BOT MODE terminal navigation', () => {
  it('retains mission selection when an early-aborted first turn restores the draft', () => {
    const { result, submission, userMessage, responseMessage } = setup(
      selection.toString(),
      '/c/saved-mission',
    );
    act(() => {
      const data = {
        earlyAbort: true,
        conversation: { conversationId: 'saved-mission' },
        requestMessage: userMessage,
        responseMessage,
      };
      result.current.handlers.finalHandler(data, submission);
    });
    expect(result.current.location.pathname).toBe('/c/new');
    expect(shouldUseBotModeMission(new URLSearchParams(result.current.location.search))).toBe(true);
  });

  it.each([false, true])('preserves mission routing when a turn settles (error: %s)', (error) => {
    const { result, submission, userMessage, responseMessage } = setup();
    act(() => {
      result.current.handlers.finalHandler(
        {
          conversation: { conversationId: 'saved-mission' },
          requestMessage: userMessage,
          responseMessage: { ...responseMessage, error },
        },
        submission,
      );
    });
    expect(result.current.location.pathname).toBe('/c/saved-mission');
    const params = new URLSearchParams(result.current.location.search);
    expect(params.get('botmode_agent_bindings')).toBe(selection.get('botmode_agent_bindings'));
    expect(params.get('botmode_agent_mode')).toBe('manual');
    expect(shouldUseBotModeMission(params, 'Continue after the failure')).toBe(true);
  });

  it('does not enable missions for an ordinary conversation', () => {
    const { result, submission, userMessage, responseMessage } = setup('agent_id=worker-agent');
    act(() => {
      result.current.handlers.finalHandler(
        {
          conversation: { conversationId: 'saved-mission' },
          requestMessage: userMessage,
          responseMessage,
        },
        submission,
      );
    });
    expect(result.current.location.search).toBe('');
    expect(shouldUseBotModeMission(new URLSearchParams(result.current.location.search))).toBe(
      false,
    );
  });
});
