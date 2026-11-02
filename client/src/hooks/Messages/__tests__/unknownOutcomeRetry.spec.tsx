import React from 'react';
import { act, renderHook } from '@testing-library/react';
import useMessageActions from '../useMessageActions';

jest.mock('recoil', () => ({ useRecoilValue: () => false }));
jest.mock('~/store', () => ({ __esModule: true, default: { UsernameDisplay: 'test' } }));
jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));
jest.mock('~/hooks/AuthContext', () => ({ useAuthContext: () => ({ user: null }) }));
jest.mock('~/hooks/Chat', () => ({ useGetAddedConvo: () => () => undefined }));
jest.mock('~/Providers', () => ({
  useAssistantsMapContext: () => ({}),
  useAgentsMapContext: () => ({}),
}));
jest.mock('librechat-data-provider', () => ({
  getTagByKey: () => undefined,
  isAgentsEndpoint: () => false,
  isAssistantsEndpoint: () => false,
}));
jest.mock('librechat-data-provider/react-query', () => ({
  useUpdateFeedbackMutation: () => ({ mutate: jest.fn() }),
}));
jest.mock('../useCopyToClipboard', () => ({
  __esModule: true,
  default: () => () => undefined,
  hasCopyableText: () => false,
}));

const unknown = { messageId: 'assistant-1', isCreatedByUser: false, error: true, text: 'OUTCOME_UNKNOWN' };
const setup = (message: Record<string, unknown> = unknown) => {
  const regenerate = jest.fn();
  const chatContext = {
    regenerate,
    isSubmitting: false,
    conversation: { conversationId: 'c-1', endpoint: 'agents' },
    latestMessageId: 'assistant-1',
  };
  const { result } = renderHook(() => useMessageActions({
    message: message as any,
    chatContext: chatContext as any,
    currentEditId: -1,
    setCurrentEditId: jest.fn(),
  }));
  return { result, regenerate };
};

describe('BOT MODE unknown provider outcome retry', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  it('refuses regeneration when the user declines the quota/cost warning', () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const { result, regenerate } = setup();
    act(() => result.current.regenerateMessage());
    expect(confirm).toHaveBeenCalledWith('com_ui_outcome_unknown_retry_confirm');
    expect(regenerate).not.toHaveBeenCalled();
  });

  it('permits a fresh regeneration only after explicit confirmation', () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const { result, regenerate } = setup();
    act(() => result.current.regenerateMessage());
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(regenerate).toHaveBeenCalledTimes(1);
  });

  it('does not change regeneration for other errors', () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const { result, regenerate } = setup({ ...unknown, text: 'Other error' });
    act(() => result.current.regenerateMessage());
    expect(confirm).not.toHaveBeenCalled();
    expect(regenerate).toHaveBeenCalledTimes(1);
  });
});
