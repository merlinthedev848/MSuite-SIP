import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CredentialsScreen } from '../components/CredentialsScreen';
import { DEFAULT_SIP_SETTINGS } from '../hooks/useSipSettings';

describe('CredentialsScreen component', () => {
  const mockAudio = [{ id: 'mic1', name: 'USB Mic' }];

  it('renders provisioning form by default with validation', async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn();

    render(
      <CredentialsScreen
        initialSettings={DEFAULT_SIP_SETTINGS}
        audioInputs={mockAudio}
        audioOutputs={mockAudio}
        onSubmit={handleSubmit}
      />
    );

    expect(screen.getByRole('heading', { name: /merlin sip/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/device provisioning pin/i)).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /provision device/i });
    await user.click(submitBtn);

    // Validation error should show
    expect(screen.getByText(/please enter an 8-character provisioning code/i)).toBeInTheDocument();
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it('switches to manual SIP mode and validates required credentials', async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn();

    render(
      <CredentialsScreen
        initialSettings={DEFAULT_SIP_SETTINGS}
        audioInputs={mockAudio}
        audioOutputs={mockAudio}
        onSubmit={handleSubmit}
      />
    );

    const manualRadio = screen.getByLabelText(/sip credentials/i);
    await user.click(manualRadio);

    expect(screen.getByLabelText(/^extension$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/auth username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/sip password/i)).toBeInTheDocument();

    const connectBtn = screen.getByRole('button', { name: /save & connect/i });
    await user.click(connectBtn);

    expect(screen.getByText(/extension is required/i)).toBeInTheDocument();
  });

  it('submits valid manual credentials successfully', async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn();

    render(
      <CredentialsScreen
        initialSettings={DEFAULT_SIP_SETTINGS}
        audioInputs={mockAudio}
        audioOutputs={mockAudio}
        onSubmit={handleSubmit}
      />
    );

    await user.click(screen.getByLabelText(/sip credentials/i));

    await user.type(screen.getByLabelText(/^extension$/i), '101');
    await user.type(screen.getByLabelText(/auth username/i), '101');
    await user.type(screen.getByLabelText(/sip password/i), 'secret123');

    await user.click(screen.getByRole('button', { name: /save & connect/i }));

    expect(handleSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        extension: '101',
        username: '101',
        password: 'secret123'
      })
    );
  });
});
