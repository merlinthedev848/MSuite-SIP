import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsModal } from '../components/SettingsModal';
import { DEFAULT_SIP_SETTINGS } from '../hooks/useSipSettings';

describe('SettingsModal component', () => {
  const mockAudio = [{ id: 'mic1', name: 'Studio Mic' }];

  it('renders modal when isOpen is true and switches tabs', async () => {
    const user = userEvent.setup();
    const handleSetTab = vi.fn();
    const handleSave = vi.fn();

    const { rerender } = render(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        settingsTab="general"
        setSettingsTab={handleSetTab}
        settings={DEFAULT_SIP_SETTINGS}
        onSaveSettings={handleSave}
        audioInputs={mockAudio}
        audioOutputs={mockAudio}
        onStartDiagnostics={vi.fn()}
        onResetApp={vi.fn()}
      />
    );

    expect(screen.getByRole('dialog', { name: /application settings/i })).toBeInTheDocument();
    expect(screen.getByText(/queue pickup prefix/i)).toBeInTheDocument();

    const accountTab = screen.getByRole('tab', { name: /account/i });
    await user.click(accountTab);
    expect(handleSetTab).toHaveBeenCalledWith('account');

    // Re-render on account tab
    rerender(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        settingsTab="account"
        setSettingsTab={handleSetTab}
        settings={DEFAULT_SIP_SETTINGS}
        onSaveSettings={handleSave}
        audioInputs={mockAudio}
        audioOutputs={mockAudio}
        onStartDiagnostics={vi.fn()}
        onResetApp={vi.fn()}
      />
    );

    expect(screen.getByLabelText(/server address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/transport protocol/i)).toBeInTheDocument();
  });

  it('saves modified draft settings on Save button click', async () => {
    const user = userEvent.setup();
    const handleSave = vi.fn();
    const handleClose = vi.fn();

    render(
      <SettingsModal
        isOpen={true}
        onClose={handleClose}
        settingsTab="general"
        setSettingsTab={vi.fn()}
        settings={DEFAULT_SIP_SETTINGS}
        onSaveSettings={handleSave}
        audioInputs={mockAudio}
        audioOutputs={mockAudio}
        onStartDiagnostics={vi.fn()}
        onResetApp={vi.fn()}
      />
    );

    const mobileInput = screen.getByLabelText(/direct mobile extension/i);
    await user.type(mobileInput, '07700900123');

    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    await user.click(saveBtn);

    expect(handleSave).toHaveBeenCalledWith(
      expect.objectContaining({
        mobileNumber: '07700900123'
      })
    );
    expect(handleClose).toHaveBeenCalled();
  });
});
