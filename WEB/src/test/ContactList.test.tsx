import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContactList } from '../components/ContactList';
import type { Contact } from '../types';

const MOCK_CONTACTS: Contact[] = [
  { name: 'Alice Smith', number: '101', presence: 'online', company: 'Tech Support' },
  { name: 'Bob Jones', number: '102', presence: 'busy', company: 'Sales' },
  { name: 'Carol White', number: '103', presence: 'offline' }
];

describe('ContactList component', () => {
  it('renders contacts with presence and company information', () => {
    render(
      <ContactList
        contacts={MOCK_CONTACTS}
        searchQuery=""
        setSearchQuery={vi.fn()}
        onSelectDestination={vi.fn()}
      />
    );

    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    expect(screen.getByText('Carol White')).toBeInTheDocument();
    expect(screen.getByText(/Ext 101 • Tech Support/)).toBeInTheDocument();
  });

  it('filters contacts by name or number', () => {
    render(
      <ContactList
        contacts={MOCK_CONTACTS}
        searchQuery="alice"
        setSearchQuery={vi.fn()}
        onSelectDestination={vi.fn()}
      />
    );

    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.queryByText('Bob Jones')).not.toBeInTheDocument();
  });

  it('triggers voice call and video call actions', () => {
    const handleVoiceCall = vi.fn();
    const handleVideoCall = vi.fn();

    render(
      <ContactList
        contacts={MOCK_CONTACTS}
        searchQuery=""
        setSearchQuery={vi.fn()}
        onSelectDestination={handleVoiceCall}
        onVideoCallDestination={handleVideoCall}
      />
    );

    const voiceBtn = screen.getByRole('button', { name: /voice call alice smith/i });
    fireEvent.click(voiceBtn);
    expect(handleVoiceCall).toHaveBeenCalledWith('101');

    const videoBtn = screen.getByRole('button', { name: /video call alice smith/i });
    fireEvent.click(videoBtn);
    expect(handleVideoCall).toHaveBeenCalledWith('101');
  });

  it('renders empty state when no contacts match', () => {
    render(
      <ContactList
        contacts={MOCK_CONTACTS}
        searchQuery="nonexistent"
        setSearchQuery={vi.fn()}
        onSelectDestination={vi.fn()}
      />
    );

    expect(screen.getByText(/no matching contacts/i)).toBeInTheDocument();
  });
});
