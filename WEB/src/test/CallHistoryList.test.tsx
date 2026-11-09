import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CallHistoryList } from '../components/CallHistoryList';
import type { CallRecord } from '../types';

const MOCK_HISTORY: CallRecord[] = [
  { id: '1', destination: '100', type: 'incoming', time: '10:30', duration: '1:45' },
  { id: '2', destination: '101', type: 'outgoing', time: '11:15', duration: '0:30' },
  { id: '3', destination: '500', type: 'missed', time: '12:00' }
];

describe('CallHistoryList component', () => {
  it('renders history list with records and formatted information', () => {
    render(
      <CallHistoryList
        history={MOCK_HISTORY}
        searchQuery=""
        setSearchQuery={vi.fn()}
        onSelectDestination={vi.fn()}
        onClearHistory={vi.fn()}
      />
    );

    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('101')).toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.getByText(/10:30 • 1:45/)).toBeInTheDocument();
  });

  it('filters history by search query', () => {
    render(
      <CallHistoryList
        history={MOCK_HISTORY}
        searchQuery="500"
        setSearchQuery={vi.fn()}
        onSelectDestination={vi.fn()}
        onClearHistory={vi.fn()}
      />
    );

    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.queryByText('100')).not.toBeInTheDocument();
  });

  it('calls onSelectDestination when a record is clicked', () => {
    const handleSelect = vi.fn();

    render(
      <CallHistoryList
        history={MOCK_HISTORY}
        searchQuery=""
        setSearchQuery={vi.fn()}
        onSelectDestination={handleSelect}
        onClearHistory={vi.fn()}
      />
    );

    const itemBtn = screen.getByRole('button', { name: /call 100/i });
    fireEvent.click(itemBtn);
    expect(handleSelect).toHaveBeenCalledWith('100');
  });

  it('shows empty state when no records exist', () => {
    render(
      <CallHistoryList
        history={[]}
        searchQuery=""
        setSearchQuery={vi.fn()}
        onSelectDestination={vi.fn()}
        onClearHistory={vi.fn()}
      />
    );

    expect(screen.getByText(/no calls recorded yet/i)).toBeInTheDocument();
  });
});
