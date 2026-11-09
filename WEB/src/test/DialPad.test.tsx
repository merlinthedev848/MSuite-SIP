import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DialPad } from '../components/DialPad';

describe('DialPad component', () => {
  it('renders dialpad keys and input with accessible attributes', () => {
    const handleKeyPress = vi.fn();
    const handleBackspace = vi.fn();
    const handleMakeCall = vi.fn();

    render(
      <DialPad
        destination="10"
        setDestination={vi.fn()}
        onMakeCall={handleMakeCall}
        onBackspace={handleBackspace}
        onKeyPress={handleKeyPress}
      />
    );

    const input = screen.getByLabelText(/destination phone number/i);
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('10');

    // Check keypad digit buttons
    const key1 = screen.getByRole('button', { name: /digit 1/i });
    expect(key1).toBeInTheDocument();

    const key2 = screen.getByRole('button', { name: /digit 2 abc/i });
    expect(key2).toBeInTheDocument();

    // Check action buttons
    const callBtn = screen.getByRole('button', { name: /start voice call/i });
    expect(callBtn).toBeEnabled();

    const backspaceBtn = screen.getByRole('button', { name: /backspace delete/i });
    expect(backspaceBtn).toBeInTheDocument();
  });

  it('handles key presses and backspace', async () => {
    const user = userEvent.setup();
    const handleKeyPress = vi.fn();
    const handleBackspace = vi.fn();
    const handleMakeCall = vi.fn();

    render(
      <DialPad
        destination="5"
        setDestination={vi.fn()}
        onMakeCall={handleMakeCall}
        onBackspace={handleBackspace}
        onKeyPress={handleKeyPress}
      />
    );

    const key5 = screen.getByRole('button', { name: /digit 5 jkl/i });
    await user.click(key5);
    expect(handleKeyPress).toHaveBeenCalledWith('5');

    const backspace = screen.getByRole('button', { name: /backspace delete/i });
    await user.click(backspace);
    expect(handleBackspace).toHaveBeenCalledTimes(1);
  });

  it('triggers onMakeCall when Call button or Enter is pressed', () => {
    const handleMakeCall = vi.fn();

    render(
      <DialPad
        destination="101"
        setDestination={vi.fn()}
        onMakeCall={handleMakeCall}
        onBackspace={vi.fn()}
        onKeyPress={vi.fn()}
      />
    );

    const callBtn = screen.getByRole('button', { name: /start voice call/i });
    fireEvent.click(callBtn);
    expect(handleMakeCall).toHaveBeenCalledWith('101', false);

    const input = screen.getByLabelText(/destination phone number/i);
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(handleMakeCall).toHaveBeenCalledWith('101', false);
  });
});
