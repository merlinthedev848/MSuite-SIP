import React, { useMemo } from 'react';
import { Search, User, Phone, Video, X } from 'lucide-react';
import type { Contact } from '../types';

export interface ContactListProps {
  contacts: Contact[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onSelectDestination: (number: string) => void;
  onVideoCallDestination?: (number: string) => void;
}

export const ContactList: React.FC<ContactListProps> = ({
  contacts,
  searchQuery,
  setSearchQuery,
  onSelectDestination,
  onVideoCallDestination
}) => {
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredContacts = useMemo(() => {
    if (!normalizedQuery) return contacts;
    return contacts.filter(c =>
      c.name.toLowerCase().includes(normalizedQuery) ||
      c.number.includes(normalizedQuery) ||
      (c.company && c.company.toLowerCase().includes(normalizedQuery))
    );
  }, [contacts, normalizedQuery]);

  return (
    <div className="list-container" role="region" aria-label="Contacts Directory">
      <div className="search-bar">
        <label htmlFor="contacts-search-input" className="sr-only">
          Search contacts directory
        </label>
        <Search size={16} className="search-icon" aria-hidden="true" />
        <input
          id="contacts-search-input"
          type="text"
          className="search-input"
          placeholder="Search by name, extension, department..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          aria-label="Search contacts"
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
      </div>

      <div className="list-scroll" tabIndex={0} aria-label="Contacts list">
        {filteredContacts.length > 0 ? (
          <div className="list-items-stack" role="list">
            {filteredContacts.map(c => {
              const presenceClass = `presence-${c.presence}`;
              return (
                <div key={c.number} role="listitem" className="list-item">
                  <button
                    type="button"
                    className="list-item-btn"
                    onClick={() => onSelectDestination(c.number)}
                    aria-label={`Call ${c.name}, extension ${c.number}, status ${c.presence}`}
                  >
                    <div className="avatar-circle" aria-hidden="true">
                      <User size={16} />
                      <span className={`avatar-presence-dot ${presenceClass}`} />
                    </div>
                    <div className="item-info">
                      <span className="item-title">{c.name}</span>
                      <span className="item-subtitle">
                        Ext {c.number} {c.company ? `\u2022 ${c.company}` : ''}
                      </span>
                    </div>
                  </button>

                  <div className="item-actions">
                    <button
                      type="button"
                      className="contact-action-btn action-video"
                      title={`Video call ${c.name}`}
                      aria-label={`Video call ${c.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onVideoCallDestination) onVideoCallDestination(c.number);
                        else onSelectDestination(c.number);
                      }}
                    >
                      <Video size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="contact-action-btn action-call"
                      title={`Voice call ${c.name}`}
                      aria-label={`Voice call ${c.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectDestination(c.number);
                      }}
                    >
                      <Phone size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state" role="status">
            <div className="empty-icon-circle">
              <User size={28} aria-hidden="true" />
            </div>
            <p className="empty-title">
              {contacts.length === 0 ? 'No contacts available' : 'No matching contacts'}
            </p>
            <p className="empty-desc">
              {contacts.length === 0
                ? 'Contacts will appear when loaded from PBX or local phonebook.'
                : 'Try adjusting your search criteria.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
