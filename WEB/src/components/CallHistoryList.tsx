import React from 'react';
import { Search, Trash2, Clock, Phone } from 'lucide-react';
import type { CallRecord } from '../types';

interface CallHistoryListProps {
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
  const filteredHistory = history.filter(h => 
    h.destination.includes(searchQuery)
  );

  return (
    <div className="list-container">
      <div className="search-bar">
        <Search size={16} className="text-slate-400" />
        <input 
          type="text" 
          className="search-input" 
          placeholder="Search history..." 
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        {history.length > 0 && (
          <button className="backspace-btn" onClick={onClearHistory} title="Clear History">
            <Trash2 size={16} />
          </button>
        )}
      </div>
      <div className="list-scroll">
        {filteredHistory.length > 0 ? (
          filteredHistory.map(h => (
            <div key={h.id} className="list-item" onClick={() => onSelectDestination(h.destination)}>
              <div className="item-info">
                <span className="item-title">{h.destination}</span>
                <span className="item-subtitle">{h.time} • {h.duration}</span>
              </div>
              <Phone size={14} style={{ color: 'var(--muted-color)' }} />
            </div>
          ))
        ) : (
          <div className="empty-state">
            <Clock size={32} />
            <span>No call history recorded.</span>
          </div>
        )}
      </div>
    </div>
  );
};
