import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActiveCallOverlay } from '../components/ActiveCallOverlay';
import type { ActiveCall } from '../types';

describe('ActiveCallOverlay component', () => {
  const mockCall: ActiveCall = {
    destination: '101',
    state: 'connected',
    duration: 65,
    muted: false
  };

  it('renders call destination and formatted duration', () => {
    render(
      <ActiveCallOverlay
        call={mockCall}
        onToggleMute={vi.fn()}
        onToggleHold={vi.fn()}
        onHangUp={vi.fn()}
      />
    );

    expect(screen.getByText('101')).toBeInTheDocument();
    expect(screen.getByText(/Connected \(1:05\)/i)).toBeInTheDocument();
  });

  it('handles mute, hold, and hangup actions', async () => {
    const user = userEvent.setup();
    const handleToggleMute = vi.fn();
    const handleToggleHold = vi.fn();
    const handleHangUp = vi.fn();

    render(
      <ActiveCallOverlay
        call={mockCall}
        onToggleMute={handleToggleMute}
        onToggleHold={handleToggleHold}
        onHangUp={handleHangUp}
      />
    );

    const muteBtn = screen.getByRole('button', { name: /mute microphone/i });
    await user.click(muteBtn);
    expect(handleToggleMute).toHaveBeenCalled();

    const holdBtn = screen.getByRole('button', { name: /put call on hold/i });
    await user.click(holdBtn);
    expect(handleToggleHold).toHaveBeenCalled();

    const hangupBtn = screen.getByRole('button', { name: /end call/i });
    await user.click(hangupBtn);
    expect(handleHangUp).toHaveBeenCalled();
  });

  it('supports transferring call to another extension', async () => {
    const user = userEvent.setup();
    const handleTransfer = vi.fn();

    render(
      <ActiveCallOverlay
        call={mockCall}
        onToggleMute={vi.fn()}
        onToggleHold={vi.fn()}
        onHangUp={vi.fn()}
        onTransfer={handleTransfer}
      />
    );

    const transferBtn = screen.getByRole('button', { name: /transfer call/i });
    await user.click(transferBtn);

    const targetInput = screen.getByPlaceholderText(/transfer to ext/i);
    expect(targetInput).toBeInTheDocument();

    await user.type(targetInput, '102');
    const confirmBtn = screen.getByRole('button', { name: /confirm transfer/i });
    await user.click(confirmBtn);

    expect(handleTransfer).toHaveBeenCalledWith('102');
  });
});
