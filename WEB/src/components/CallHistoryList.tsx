import React, { useMemo } from 'react';
import { Search, Trash2, Clock, PhoneOutgoing, PhoneIncoming, PhoneMissed, Phone, X } from 'lucide-react';
import type { CallRecord } from '../types';

export interface CallHistoryListProps {
  history: CallRecord[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onSelectDestination: (dest: string) => void;
  onClearHistory: () => void;
}

export const CallHistoryList: React.FC<CallHistoryListProps> = ({
  history,
  searchQuery,
  setSearchQuery,
  onSelectDestination,
  onClearHistory
}) => {
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredHistory = useMemo(() => {
    if (!normalizedQuery) return history;
    return history.filter(h =>
      h.destination.toLowerCase().includes(normalizedQuery) ||
      h.time.toLowerCase().includes(normalizedQuery) ||
      (h.duration && h.duration.toLowerCase().includes(normalizedQuery))
    );
  }, [history, normalizedQuery]);

  const getCallIcon = (type: CallRecord['type']) => {
    switch (type) {
      case 'incoming':
        return <PhoneIncoming size={15} className="call-type-incoming" aria-hidden="true" />;
      case 'missed':
        return <PhoneMissed size={15} className="call-type-missed" aria-hidden="true" />;
      case 'outgoing':
      default:
        return <PhoneOutgoing size={15} className="call-type-outgoing" aria-hidden="true" />;
    }
  };

  return (
    <div className="list-container" role="region" aria-label="Call History">
      <div className="search-bar">
        <label htmlFor="history-search-input" className="sr-only">
          Search call history
        </label>
        <Search size={16} className="search-icon" aria-hidden="true" />
        <input
          id="history-search-input"
          type="text"
          className="search-input"
          placeholder="Search by number, time, duration..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          aria-label="Search call history"
        />
        {searchQuery && (
          <button
            type="button"
            className="search-clear-btn"
            onClick={() => setSearchQuery('')}
            aria-label="Clear search input"
          >
            <X size={15} aria-hidden="true" />
          </button>
        )}
        {history.length > 0 && (
          <button
            type="button"
            className="history-action-btn"
            onClick={onClearHistory}
            aria-label="Clear all call history"
            title="Clear all call history"
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="list-scroll" tabIndex={0} aria-label="Call history list">
        {filteredHistory.length > 0 ? (
          <div className="list-items-stack" role="list">
            {filteredHistory.map(h => (
              <div
                key={h.id}
                role="listitem"
                className="list-item"
              >
                <button
                  type="button"
                  className="list-item-btn"
                  onClick={() => onSelectDestination(h.destination)}
                  aria-label={`Call ${h.destination}, ${h.type} at ${h.time}, duration ${h.duration || 'unknown'}`}
                >
                  <div className="item-icon-wrapper" aria-hidden="true">
                    {getCallIcon(h.type)}
                  </div>
                  <div className="item-info">
                    <span className="item-title">{h.destination}</span>
                    <span className="item-subtitle">
                      {h.time} &bull; {h.duration || '0:00'}
                    </span>
                  </div>
                  <span className="item-action-icon" aria-hidden="true">
                    <Phone size={14} />
                  </span>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state" role="status">
            <div className="empty-icon-circle">
              <Clock size={28} aria-hidden="true" />
            </div>
            <p className="empty-title">
              {history.length === 0 ? 'No calls recorded yet' : 'No matching calls found'}
            </p>
            <p className="empty-desc">
              {history.length === 0
                ? 'Dial a number or pick a contact to place your first call.'
                : 'Try searching with different keywords or clear the filter.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
