import React from 'react';
import { render, screen } from '@testing-library/react';
import Error from './Error';

jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));
jest.mock('./CodeBlock', () => () => null);

describe('BOT MODE uncertain provider error display', () => {
  it('renders a localized warning rather than exposing the raw code', () => {
    render(<Error text="OUTCOME_UNKNOWN" />);
    expect(screen.getByText('com_ui_outcome_unknown_message')).toBeInTheDocument();
    expect(screen.queryByText(/specific error message/)).not.toBeInTheDocument();
  });
});
