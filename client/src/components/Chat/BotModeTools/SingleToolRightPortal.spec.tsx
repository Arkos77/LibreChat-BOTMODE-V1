/** @jest-environment jsdom */
import React from 'react';
import { Provider, createStore } from 'jotai';
import { ContentTypes } from 'librechat-data-provider';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import type { TMessageContentParts } from 'librechat-data-provider';
import {
  botModeToolsRightCountAtom,
  botModeToolsRightHostAtom,
} from './state';
import { BotModeViewContext } from '~/components/Chat/BotModeViewContext';
import SingleToolRightPortal from './SingleToolRightPortal';

const singleSearchPart = {
  type: ContentTypes.TOOL_CALL,
  [ContentTypes.TOOL_CALL]: {
    id: 'search-1',
    name: 'web_search',
    args: '{"query":"Ballon d Or 2026"}',
    output: 'Search results found',
  },
} as unknown as TMessageContentParts;

describe('BOT MODE isolated web_search tool in right Progression panel', () => {
  it('relocates the original single tool and returns it inline when the panel closes', async () => {
    const host = document.createElement('div');
    host.id = 'botmode-tools-right-host';
    document.body.appendChild(host);
    const store = createStore();
    store.set(botModeToolsRightHostAtom, host);
    const view = render(
      <Provider store={store}>
        <BotModeViewContext.Provider value={true}>
          <div data-testid="conversation">
            <SingleToolRightPortal part={singleSearchPart} withinActivityPhase={false} hasAttachments={false}>
              <button type="button">Searched the web</button>
            </SingleToolRightPortal>
          </div>
        </BotModeViewContext.Provider>
      </Provider>,
    );
    try {
      await waitFor(() =>
        expect(within(host).getByRole('button', { name: 'Searched the web' })).toBeInTheDocument(),
      );
      expect(within(view.getByTestId('conversation')).queryByRole('button')).toBeNull();
      await waitFor(() => expect(store.get(botModeToolsRightCountAtom)).toBe(1));

      act(() => store.set(botModeToolsRightHostAtom, null));
      await waitFor(() => {
        expect(within(view.getByTestId('conversation')).getByRole('button')).toBeInTheDocument();
      });
      expect(within(host).queryByRole('button')).toBeNull();
      await waitFor(() => expect(store.get(botModeToolsRightCountAtom)).toBe(0));
    } finally {
      view.unmount();
      host.remove();
    }
  });

  it('preserves pending approvals and attachment-bearing calls inside the message', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const store = createStore();
    store.set(botModeToolsRightHostAtom, host);
    const approval = {
      type: ContentTypes.TOOL_CALL,
      [ContentTypes.TOOL_CALL]: {
        id: 'approval-1',
        name: 'approval_probe',
        args: {},
        output: '',
        approval: { actionId: 'action-1', allowed_decisions: ['approve', 'reject'] },
      },
    } as unknown as TMessageContentParts;
    const view = render(
      <Provider store={store}>
        <BotModeViewContext.Provider value={true}>
          <div data-testid="conversation">
            <SingleToolRightPortal part={approval} withinActivityPhase={false} hasAttachments={false}>
              <button type="button">Approve?</button>
            </SingleToolRightPortal>
            <SingleToolRightPortal part={singleSearchPart} withinActivityPhase={false} hasAttachments>
              <button type="button">File-bearing tool</button>
            </SingleToolRightPortal>
          </div>
        </BotModeViewContext.Provider>
      </Provider>,
    );
    try {
      expect(within(view.getByTestId('conversation')).getByText('Approve?')).toBeInTheDocument();
      expect(within(view.getByTestId('conversation')).getByText('File-bearing tool')).toBeInTheDocument();
      expect(within(host).queryByRole('button')).toBeNull();
      expect(store.get(botModeToolsRightCountAtom)).toBe(0);
    } finally {
      view.unmount();
      host.remove();
    }
  });

  it('leaves non-BOTMODE conversations and phase-contained tools unchanged', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const store = createStore();
    store.set(botModeToolsRightHostAtom, host);
    const view = render(
      <Provider store={store}>
        <BotModeViewContext.Provider value={true}>
          <div data-testid="conversation">
            <SingleToolRightPortal part={singleSearchPart} withinActivityPhase hasAttachments={false}>
              <button>Within phase</button>
            </SingleToolRightPortal>
          </div>
        </BotModeViewContext.Provider>
      </Provider>,
    );
    try {
      expect(within(view.getByTestId('conversation')).getByText('Within phase')).toBeInTheDocument();
      expect(within(host).queryByRole('button')).toBeNull();
    } finally {
      view.unmount();
      host.remove();
    }
  });
});
