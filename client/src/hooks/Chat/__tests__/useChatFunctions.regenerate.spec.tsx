import { renderHook, act } from '@testing-library/react';
import { Constants, EModelEndpoint } from 'librechat-data-provider';
import type { TConversation, TMessage, TSubmission } from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';
import useChatFunctions from '../useChatFunctions';
import { isPasteSubmitted } from '~/utils';

const mockNavigate = jest.fn();
const mockSetShowStopButton = jest.fn();
const mockSetIsSubmitting = jest.fn();
const mockGetEphemeralAgent = jest.fn(() => null);
const mockSetFilesToDelete = jest.fn();
const mockGetSender = jest.fn(() => 'Assistant');
const mockGetExpiry = jest.fn(() => 'expiry-key');
const mockGetQueryData = jest.fn(() => ({}));
const mockLoggerWarn = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('react-router-dom', () => ({
  useSearchParams: () => [mockSearchParams, jest.fn()],
  useNavigate: () => mockNavigate,
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    getQueryData: mockGetQueryData,
    getQueryState: jest.fn(() => undefined),
  }),
}));

jest.mock('recoil', () => ({
  useRecoilValue: () => false,
  useSetRecoilState: (atom: unknown) =>
    String(atom).includes('isSubmitting') ? mockSetIsSubmitting : mockSetShowStopButton,
  useRecoilCallback: (factory: any) =>
    factory({
      snapshot: {
        getLoadable: () => ({ state: 'hasValue', contents: [] }),
      },
      set: jest.fn(),
      reset: jest.fn(),
    }),
}));

jest.mock('~/hooks/Files/useSetFilesToDelete', () => () => mockSetFilesToDelete);
jest.mock('~/hooks/Conversations/useGetSender', () => () => mockGetSender);
jest.mock('~/hooks/Input/useUserKey', () => () => ({ getExpiry: mockGetExpiry }));
jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: null }),
}));
jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    isTemporary: 'isTemporary',
    isSubmittingFamily: () => 'isSubmitting',
    submissionStartFamily: () => 'submissionStart',
    showStopButtonByIndex: () => 'showStopButton',
    pendingManualSkillsByConvoId: () => 'pendingManualSkills',
    pendingQuotesByConvoId: () => 'pendingQuotes',
    messagesSiblingIdxFamily: () => 'messagesSiblingIdx',
  },
  useGetEphemeralAgent: () => mockGetEphemeralAgent,
}));
jest.mock('~/utils', () => ({
  ...jest.requireActual('~/utils'),
  logger: {
    log: jest.fn(),
    dir: jest.fn(),
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
  },
  createDualMessageContent: jest.fn(() => []),
  getRouteChatProjectId: jest.fn(() => null),
  requestChatFocus: jest.fn(),
}));

const userMessage = (messageId: string, parentMessageId = '00000000-0000-0000-0000-000000000000') =>
  ({
    messageId,
    parentMessageId,
    conversationId: 'conversation-1',
    isCreatedByUser: true,
    sender: 'User',
    text: messageId,
  }) as TMessage;

const assistantMessage = (messageId: string, parentMessageId: string) =>
  ({
    messageId,
    parentMessageId,
    conversationId: 'conversation-1',
    isCreatedByUser: false,
    sender: 'Assistant',
    text: messageId,
  }) as TMessage;

const conversation = (conversationId: string) =>
  ({
    conversationId,
    endpoint: EModelEndpoint.agents,
    model: 'gpt-4o',
    agent_id: 'agent-1',
  }) as TConversation;

function renderAsk(
  messages: TMessage[] | undefined,
  conversationId = 'conversation-1',
  options: {
    endpoint?: TConversation['endpoint'];
    isSubmitting?: boolean;
    files?: Map<string, ExtendedFile>;
  } = {},
) {
  const setMessages = jest.fn();
  const setSubmission = jest.fn();
  const getMessages = jest.fn(() => messages);
  const immutableConversation = conversation(conversationId);
  if ('endpoint' in options) {
    immutableConversation.endpoint = options.endpoint ?? null;
  }
  const hook = renderHook(() =>
    useChatFunctions({
      isSubmitting: options.isSubmitting ?? false,
      latestMessage: messages?.at(-1) ?? null,
      conversation: immutableConversation,
      getMessages,
      setMessages,
      setSubmission,
      files: options.files,
      setFiles: jest.fn(),
    }),
  );

  return { ...hook, getMessages, setMessages, setSubmission };
}

describe('useChatFunctions ask', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetQueryData.mockReturnValue({});
    mockSearchParams = new URLSearchParams();
  });

  it.each(['auto', 'manual'])(
    'keeps the %s mission active after the initial navigation',
    (mode) => {
      const bindings = JSON.stringify([
        { id: 'research-agent', name: 'RECHERCHE' },
        { id: 'analysis-agent', name: 'ANALYSE' },
        { id: 'writing-agent', name: 'RÉDACTION' },
      ]);
      mockSearchParams = new URLSearchParams({
        botmode: '1',
        botmode_mode: 'analyze',
        botmode_agent_mode: mode,
        botmode_agent_bindings: bindings,
        agent_id: 'agent-1',
        prompt: 'one-shot launch prompt',
        submit: 'true',
      });
      const initial = renderAsk([], Constants.NEW_CONVO);
      act(() => {
        initial.result.current.ask({ text: 'Investigate the request' });
      });
      const destination = new URL(mockNavigate.mock.calls.at(-1)![0], 'http://localhost');
      expect(destination.searchParams.get('botmode_mode')).toBe('analyze');
      expect(destination.searchParams.get('botmode_agent_mode')).toBe(mode);
      expect(destination.searchParams.get('botmode_agent_bindings')).toBe(bindings);
      expect(destination.searchParams.has('prompt')).toBe(false);
      expect(destination.searchParams.has('submit')).toBe(false);

      mockSearchParams = destination.searchParams;
      initial.unmount();
      const followUp = renderAsk([], 'saved-mission');
      act(() => {
        followUp.result.current.ask({ text: 'Continue after the failure' });
      });
      const next = followUp.setSubmission.mock.calls[0][0];
      expect(next.userMessage.orchestratorMission).toBeDefined();
      expect(next.userMessage.orchestratorMission.plannerContext.specialists).toHaveLength(3);
    },
  );

  it.each([false, true])(
    'keeps empty file overrides authoritative for BOT MODE (regenerate: %s)',
    (isRegenerate) => {
      mockSearchParams = new URLSearchParams({
        botmode: '1',
        botmode_mode: 'analyze',
        botmode_agent_mode: 'auto',
        botmode_agent_bindings: JSON.stringify([
          { id: 'research-agent', name: 'RECHERCHE' },
          { id: 'analysis-agent', name: 'ANALYSE' },
          { id: 'documents-agent', name: 'DOCUMENTS' },
          { id: 'writing-agent', name: 'RÉDACTION' },
        ]),
      });
      const parent = {
        ...userMessage('user-files'),
        files: [{ file_id: 'old-parent-file' }],
      } as TMessage;
      const { result, setSubmission } = renderAsk(
        [parent, assistantMessage('response-files', parent.messageId)],
        'conversation-1',
        {
          files: new Map([
            [
              'next-draft-file',
              {
                file_id: 'next-draft-file',
                filename: 'next.pdf',
                type: 'application/pdf',
              } as ExtendedFile,
            ],
          ]),
        },
      );
      act(() => {
        result.current.ask(
          { text: 'Analyze this request', parentMessageId: parent.messageId },
          { isRegenerate, overrideFiles: [] },
        );
      });
      expect(setSubmission).toHaveBeenCalledTimes(1);
      const submission = setSubmission.mock.calls[0][0] as TSubmission & {
        userMessage: { orchestratorMission: { mission: { objectives: Array<{ key: string }> } } };
      };
      expect(submission.userMessage.files ?? []).toEqual([]);
      expect(
        submission.userMessage.orchestratorMission.mission.objectives.map((task) => task.key),
      ).toEqual(['research', 'analysis', 'synthesis']);
    },
  );

  it('refuses to send to an existing conversation before its history loads', () => {
    const { result, getMessages, setMessages, setSubmission } = renderAsk(undefined);

    let askResult: ReturnType<typeof result.current.ask>;
    act(() => {
      askResult = result.current.ask({ text: 'Hello', conversationId: 'conversation-1' });
    });

    expect(askResult!).toBe(false);
    expect(getMessages).toHaveBeenCalledWith('conversation-1');
    expect(setMessages).not.toHaveBeenCalled();
    expect(setSubmission).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      '[useChatFunctions] Refusing to send before existing conversation history loads',
    );
  });

  it('synchronously reports a refusal while another submit is in flight', () => {
    const { result, setMessages, setSubmission } = renderAsk([], 'conversation-1', {
      isSubmitting: true,
    });

    let askResult: ReturnType<typeof result.current.ask>;
    act(() => {
      askResult = result.current.ask({ text: 'queued follow-up' });
    });

    expect(askResult!).toBe(false);
    expect(setMessages).not.toHaveBeenCalled();
    expect(setSubmission).not.toHaveBeenCalled();
    expect(mockSetShowStopButton).not.toHaveBeenCalled();
  });

  it('reports a refusal when no endpoint is available', () => {
    const { result, setMessages, setSubmission } = renderAsk([], 'conversation-1', {
      endpoint: null,
    });

    let askResult: ReturnType<typeof result.current.ask>;
    act(() => {
      askResult = result.current.ask({ text: 'queued follow-up' });
    });

    expect(askResult!).toBe(false);
    expect(setMessages).not.toHaveBeenCalled();
    expect(setSubmission).not.toHaveBeenCalled();
    expect(mockSetShowStopButton).not.toHaveBeenCalled();
  });

  it.each([
    ['empty text', { text: '   ' }, undefined],
    ['the search view', { text: 'queued follow-up', conversationId: 'search' }, undefined],
    ['a continue without a latest message', { text: 'continue' }, { isContinued: true }],
  ])('reports a refusal for %s', (_label, props, askOptions) => {
    const { result, setMessages, setSubmission } = renderAsk([]);

    let askResult: ReturnType<typeof result.current.ask>;
    act(() => {
      askResult = result.current.ask(props, askOptions);
    });

    expect(askResult!).toBe(false);
    expect(setMessages).not.toHaveBeenCalled();
    expect(setSubmission).not.toHaveBeenCalled();
  });

  it('allows an existing conversation whose loaded history is empty', () => {
    const { result, setMessages, setSubmission } = renderAsk([]);

    act(() => {
      result.current.ask({ text: 'Hello', conversationId: 'conversation-1' });
    });

    expect(setMessages).toHaveBeenCalled();
    expect(setSubmission).toHaveBeenCalled();
  });

  it('allows a new conversation before its message cache exists', () => {
    const newConversationId = Constants.NEW_CONVO as string;
    const { result, setMessages, setSubmission } = renderAsk(undefined, newConversationId);

    act(() => {
      result.current.ask({ text: 'Hello', conversationId: newConversationId });
    });

    expect(setMessages).toHaveBeenCalled();
    expect(setSubmission).toHaveBeenCalled();
  });

  it('allows explicit override messages before the cache exists', () => {
    const { result, setMessages, setSubmission } = renderAsk(undefined);

    act(() => {
      result.current.ask(
        { text: 'Hello', conversationId: 'conversation-1' },
        { overrideMessages: [] },
      );
    });

    expect(setMessages).toHaveBeenCalled();
    expect(setSubmission).toHaveBeenCalled();
  });
});

describe('useChatFunctions regenerate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetQueryData.mockReturnValue({});
  });

  it('keys a non-tail regenerate to the selected assistant response', () => {
    let messages = [
      userMessage('user-1'),
      assistantMessage('assistant-1', 'user-1'),
      userMessage('user-2', 'assistant-1'),
      assistantMessage('assistant-2', 'user-2'),
      userMessage('user-3', 'assistant-2'),
      assistantMessage('assistant-3', 'user-3'),
    ];
    const setMessages = jest.fn((nextMessages: TMessage[]) => {
      messages = nextMessages;
    });
    const setSubmission = jest.fn();
    const conversation = {
      conversationId: 'conversation-1',
      endpoint: EModelEndpoint.agents,
      model: 'gpt-4o',
      agent_id: 'agent-1',
    } as TConversation;

    const { result } = renderHook(() =>
      useChatFunctions({
        isSubmitting: false,
        latestMessage: messages[5],
        conversation,
        getMessages: () => messages,
        setMessages,
        setSubmission,
      }),
    );

    act(() => {
      result.current.regenerate(messages[1]);
    });

    const submission = setSubmission.mock.calls.at(-1)?.[0] as TSubmission;
    expect(submission.userMessage.overrideParentMessageId).toBe('user-1');
    expect(submission.userMessage.responseMessageId).toBe('assistant-1_');
    expect(submission.initialResponse?.messageId).toBe('assistant-1_');
    expect(submission.initialResponse?.parentMessageId).toBe('user-1');
    expect(submission.messages.map((message) => message.messageId)).toEqual(['user-1']);
    expect(submission.regenerateMessages?.map((message) => message.messageId)).toEqual([
      'user-1',
      'assistant-1',
      'user-2',
      'assistant-2',
      'user-3',
      'assistant-3',
    ]);
    expect(
      setMessages.mock.calls.at(-1)?.[0].map((message: TMessage) => message.messageId),
    ).toEqual(['user-1', 'assistant-1_']);
    expect(messages.at(-1)?.messageId).toBe('assistant-1_');
  });
});

describe('useChatFunctions ask attachments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetQueryData.mockReturnValue({});
  });

  /** The server titles an attachment-only turn from the submitted filenames
   *  (getAttachmentTitleText), so the fresh-file mapping must carry them. */
  it('carries the filename on freshly attached files', () => {
    const setMessages = jest.fn();
    const setSubmission = jest.fn();
    const setFiles = jest.fn();
    const files = new Map([
      [
        'file-1',
        {
          file_id: 'file-1',
          filepath: '/uploads/file-1',
          filename: 'quarterly-report.pdf',
          type: 'application/pdf',
        },
      ],
    ]) as unknown as Parameters<typeof useChatFunctions>[0]['files'];

    const { result } = renderHook(() =>
      useChatFunctions({
        isSubmitting: false,
        latestMessage: null,
        conversation: conversation(Constants.NEW_CONVO as string),
        getMessages: () => [],
        setMessages,
        setSubmission,
        files,
        setFiles,
      }),
    );

    act(() => {
      result.current.ask({ text: '' });
    });

    const submission = setSubmission.mock.calls.at(-1)?.[0] as TSubmission;
    expect(submission.userMessage.files?.[0]).toMatchObject({
      file_id: 'file-1',
      filename: 'quarterly-report.pdf',
    });
  });

  it('marks files consumed through overrideFiles as submitted', () => {
    const overrideFiles = [
      {
        file_id: 'queued-override-file',
        temp_file_id: 'queued-override-temp-file',
        filepath: '/uploads/queued-override-file',
        filename: 'queued-override.txt',
        type: 'text/plain',
      },
    ];
    const setMessages = jest.fn();
    const setSubmission = jest.fn();
    const setFiles = jest.fn();

    const { result } = renderHook(() =>
      useChatFunctions({
        isSubmitting: false,
        latestMessage: null,
        conversation: conversation(Constants.NEW_CONVO as string),
        getMessages: () => [],
        setMessages,
        setSubmission,
        files: new Map(),
        setFiles,
      }),
    );

    act(() => {
      result.current.ask(
        { text: 'queued override' },
        {
          overrideFiles,
        },
      );
    });

    expect(isPasteSubmitted('queued-override-file')).toBe(true);
    expect(isPasteSubmitted('queued-override-temp-file')).toBe(true);
  });
});
