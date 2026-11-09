import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

describe('App component full workflow', () => {
  beforeEach(() => {
    localStorage.clear();
    // Seed with basic config so App loads into main view
    localStorage.setItem(
      'merlin_sip_config',
      JSON.stringify({
        sipServer: 'pbx.chriskendall.media',
        extension: '101',
        username: '101',
        password: 'password123'
      })
    );
  });

  it('renders main application header, navigation tabs, and default dialer', () => {
    render(<App />);

    expect(screen.getByText('Merlin SIP')).toBeInTheDocument();
    expect(screen.getByText('Ext 101')).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();

    expect(screen.getByRole('tab', { name: /phone/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /history/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /contacts/i })).toBeInTheDocument();

    expect(screen.getByRole('region', { name: /phone dialer/i })).toBeInTheDocument();
  });

  it('navigates seamlessly between Phone, History, and Contacts tabs', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Click Contacts Tab
    const contactsTab = screen.getByRole('tab', { name: /contacts/i });
    await user.click(contactsTab);

    expect(screen.getByRole('region', { name: /contacts directory/i })).toBeInTheDocument();
    expect(screen.getByText('Technical Support')).toBeInTheDocument();
    expect(screen.getByText('Operations Bridge')).toBeInTheDocument();

    // Click History Tab
    const historyTab = screen.getByRole('tab', { name: /history/i });
    await user.click(historyTab);

    expect(screen.getByRole('region', { name: /call history/i })).toBeInTheDocument();

    // Return to Phone Tab
    const phoneTab = screen.getByRole('tab', { name: /phone/i });
    await user.click(phoneTab);

    expect(screen.getByRole('region', { name: /phone dialer/i })).toBeInTheDocument();
  });

  it('allows entering a number on dialpad and initiating an active call with controls', async () => {
    const user = userEvent.setup();
    render(<App />);

    const key1 = screen.getByRole('button', { name: /digit 1/i });
    const key0 = screen.getByRole('button', { name: /digit 0/i });

    await user.click(key1);
    await user.click(key0);
    await user.click(key0);

    const callBtn = screen.getByRole('button', { name: /start voice call/i });
    await user.click(callBtn);

    // Active call overlay should now be open
    expect(screen.getByRole('dialog', { name: /call with 100/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mute microphone/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /put call on hold/i })).toBeInTheDocument();

    // End call
    const hangupBtn = screen.getByRole('button', { name: /end call/i });
    await user.click(hangupBtn);

    // Overlay closed, back to dialer
    expect(screen.queryByRole('dialog', { name: /call with 100/i })).not.toBeInTheDocument();
  });

  it('opens and closes settings modal', async () => {
    const user = userEvent.setup();
    render(<App />);

    const settingsBtn = screen.getByRole('button', { name: /open application settings/i });
    await user.click(settingsBtn);

    expect(screen.getByRole('dialog', { name: /application settings/i })).toBeInTheDocument();

    const closeBtn = screen.getByRole('button', { name: /close dialog/i });
    await user.click(closeBtn);

    expect(screen.queryByRole('dialog', { name: /application settings/i })).not.toBeInTheDocument();
  });
});
