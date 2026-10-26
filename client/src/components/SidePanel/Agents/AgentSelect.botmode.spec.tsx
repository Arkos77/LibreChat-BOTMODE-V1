/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AgentSelect from './AgentSelect';

const mockSetCurrentAgentId = jest.fn();
const mockCreateReset = jest.fn();
const mockResetForm = jest.fn();
const mockAgentList = [
  { id: 'worker', name: 'BOT MODE Worker' },
  { id: 'research', name: 'RECHERCHE' },
  { id: 'analysis', name: 'ANALYSE' },
  { id: 'code', name: 'CODE' },
  { id: 'documents', name: 'DOCUMENTS' },
  { id: 'writing', name: 'RÉDACTION' },
];
let mockList = [...mockAgentList];

jest.mock('react-hook-form', () => ({
  useFormContext: () => ({
    control: {},
    getValues: jest.fn(() => []),
    reset: mockResetForm,
    setValue: jest.fn(),
    formState: { dirtyFields: {} },
  }),
  Controller: ({ render }: { render: (args: unknown) => React.ReactNode }) =>
    render({ field: { value: { value: 'worker', label: 'BOT MODE Worker' } } }),
}));

jest.mock('@librechat/client', () => ({
  ControlCombobox: ({
    items,
    ariaLabel,
    selectPlaceholder,
    selectedValue,
    setValue,
  }: {
    items: Array<{ label: string; value: string }>;
    ariaLabel: string;
    selectPlaceholder: string;
    selectedValue: string;
    setValue: (id: string) => void;
  }) => (
    <div role="group" aria-label={ariaLabel}>
      <span data-testid="specialist-placeholder">{selectPlaceholder}</span>
      <span data-testid="specialist-selected-value">{selectedValue}</span>
      {items.map(({ label, value }) => (
        <button key={value} onClick={() => setValue(value)} type="button">
          {label}
        </button>
      ))}
    </div>
  ),
}));

jest.mock('~/data-provider', () => ({
  useListAgentsQuery: (
    _args: unknown,
    options: { select: (response: { data: typeof mockAgentList }) => typeof mockAgentList },
  ) => ({ data: options.select({ data: mockList }) }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useAgentDefaultPermissionLevel: () => 1,
}));

jest.mock('~/utils', () => ({
  cn: (...names: Array<string | false | undefined>) => names.filter(Boolean).join(' '),
  createProviderOption: (name: string) => ({ label: name, value: name }),
  processAgentOption: ({ agent }: { agent: { id: string; name: string } }) => agent,
  getDefaultAgentFormValues: () => ({}),
}));

function renderSelect(selectedAgentId: string | null = null) {
  return render(
    <AgentSelect
      selectedAgentId={selectedAgentId}
      agentQuery={{ data: undefined, isSuccess: false } as any}
      setCurrentAgentId={mockSetCurrentAgentId}
      createMutation={{ reset: mockCreateReset } as any}
      defaultStatefulCodeEnvironment={'user' as any}
    />,
  );
}

beforeEach(() => {
  mockList = [...mockAgentList];
  jest.clearAllMocks();
});

describe('BOT MODE orchestrator separate from specialist agent selector', () => {
  it('shows Worker as a separate selectable orchestrator while offering five specialist agents', () => {
    renderSelect();
    const group = screen.getByRole('group', { name: 'com_agents_botmode_specialists' });
    expect(group).toBeInTheDocument();
    for (const specialist of ['RECHERCHE', 'ANALYSE', 'CODE', 'DOCUMENTS', 'RÉDACTION']) {
      expect(group).toHaveTextContent(specialist);
    }
    expect(group).not.toHaveTextContent('BOT MODE Worker');
    const orchestratorButton = screen.getByRole('button', {
      name: 'com_agents_botmode_select_orchestrator',
    });
    expect(orchestratorButton).toHaveTextContent('BOT MODE Worker');
    fireEvent.click(orchestratorButton);
    expect(mockSetCurrentAgentId).toHaveBeenCalledWith('worker');
  });

  it('shows the specialist placeholder when Worker is the current selected agent', () => {
    renderSelect('worker');
    expect(screen.getByTestId('specialist-placeholder')).toHaveTextContent(
      'com_agents_botmode_select_specialist',
    );
    expect(screen.getByTestId('specialist-selected-value')).toBeEmptyDOMElement();
    expect(
      screen.getByRole('button', { name: 'com_agents_botmode_select_orchestrator' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the ordinary combobox for installations without BOT MODE Worker', () => {
    mockList = [{ id: 'other-agent', name: 'OTHER AGENT' }];
    renderSelect();
    expect(
      screen.queryByRole('button', { name: 'com_agents_botmode_select_orchestrator' }),
    ).toBeNull();
    expect(screen.getByRole('group', { name: 'com_ui_agent' })).toHaveTextContent('OTHER AGENT');
  });
});
