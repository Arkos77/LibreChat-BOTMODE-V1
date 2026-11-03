/**
 * @jest-environment jsdom
 */
import * as React from 'react';
import { dataService } from 'librechat-data-provider';
import { FormProvider, useForm } from 'react-hook-form';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AgentForm } from '~/common';
import BotModeSetupButton from './BotModeSetupButton';

const mockShowToast = jest.fn();
const mockLocalize = (key: string) => key;

jest.mock('@librechat/client', () => ({
  Button: ({ children, onClick, ...props }: React.ComponentProps<'button'>) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
  useToastContext: () => ({ showToast: mockShowToast }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => mockLocalize,
}));

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      getBotModeSetupStatus: jest.fn(),
      initializeBotModeAgents: jest.fn(),
    },
  };
});

const getStatus = dataService.getBotModeSetupStatus as jest.Mock;
const initialize = dataService.initializeBotModeAgents as jest.Mock;

const incomplete = {
  inventoryComplete: false,
  permissionsComplete: true,
  delegationConfigured: false,
  configurationComplete: false,
  present: [],
  missing: ['BOT MODE Worker', 'RECHERCHE', 'ANALYSE', 'CODE', 'DOCUMENTS', 'RÉDACTION'],
  missingCapabilities: [],
};
const complete = {
  ...incomplete,
  inventoryComplete: true,
  delegationConfigured: true,
  configurationComplete: true,
  missing: [],
};

function TestForm({ model = 'openrouter/free' }: { model?: string }) {
  const methods = useForm<AgentForm>({
    defaultValues: {
      provider: { value: 'OpenRouter', label: 'OpenRouter' },
      model,
    },
  });
  const client = React.useMemo(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    [],
  );
  return (
    <QueryClientProvider client={client}>
      <FormProvider {...methods}>
        <BotModeSetupButton
          models={{ OpenRouter: ['openrouter/free'] }}
          modelsReady={true}
          modelsError={false}
        />
      </FormProvider>
    </QueryClientProvider>
  );
}

describe('BotModeSetupButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    initialize.mockResolvedValue({ created: [] });
  });
  afterEach(() => jest.restoreAllMocks());

  it('uses only the authenticated native setup API, then confirms all six agents', async () => {
    getStatus.mockResolvedValueOnce(incomplete).mockResolvedValueOnce(complete);
    render(<TestForm />);
    const button = await screen.findByRole('button', {
      name: 'com_ui_botmode_setup_button',
    });
    fireEvent.click(button);
    await waitFor(() => {
      expect(initialize).toHaveBeenCalledWith({
        provider: 'OpenRouter',
        model: 'openrouter/free',
      });
      expect(getStatus).toHaveBeenCalledTimes(2);
      expect(mockShowToast).toHaveBeenCalledWith({
        message: 'com_ui_botmode_setup_success',
      });
    });
  });

  it('never displays the initializer when the account is already configured', async () => {
    getStatus.mockResolvedValueOnce(complete);
    render(<TestForm />);
    await waitFor(() => expect(getStatus).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: 'com_ui_botmode_setup_button' })).toBeNull();
    expect(initialize).not.toHaveBeenCalled();
  });

  it('refuses a model outside the current account catalog', async () => {
    getStatus.mockResolvedValueOnce(incomplete);
    render(<TestForm model="unavailable/model" />);
    const button = await screen.findByRole('button', {
      name: 'com_ui_botmode_setup_button',
    });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(initialize).not.toHaveBeenCalled();
  });
});
