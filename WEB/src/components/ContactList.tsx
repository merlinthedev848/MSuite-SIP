import React from 'react';
import { Search, User, Phone } from 'lucide-react';
import type { Contact } from '../types';

interface ContactListProps {
  contacts: Contact[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onSelectDestination: (number: string) => void;
}

export const ContactList: React.FC<ContactListProps> = ({
  contacts,
  searchQuery,
  setSearchQuery,
  onSelectDestination
}) => {
  const filteredContacts = contacts.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.number.includes(searchQuery)
  );

  return (
    <div className="list-container">
      <div className="search-bar">
        <Search size={16} className="text-slate-400" />
        <input 
          type="text" 
          className="search-input" 
          placeholder="Search contacts..." 
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>
      <div className="list-scroll">
        {filteredContacts.length > 0 ? (
          filteredContacts.map(c => (
            <div key={c.number} className="list-item" onClick={() => onSelectDestination(c.number)}>
              <div className="item-info">
                <span className="item-title">{c.name}</span>
                <span className="item-subtitle">Extension {c.number}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ 
                  fontSize: 10, 
                  color: c.presence === 'online' ? 'var(--success-color)' : c.presence === 'busy' ? '#f59e0b' : 'var(--muted-color)' 
                }}>
                  {c.presence}
                </span>
                <Phone size={14} style={{ color: 'var(--muted-color)' }} />
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <User size={32} />
            <span>No contacts found.</span>
          </div>
        )}
      </div>
    </div>
  );
};
