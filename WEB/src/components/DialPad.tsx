import React, { useRef, useEffect } from 'react';
import { Phone, Delete, Video } from 'lucide-react';
import { Button } from './ui/Button';

export interface DialPadProps {
  destination: string;
  setDestination: (dest: string | ((prev: string) => string)) => void;
  onMakeCall: (target?: string, isVideo?: boolean) => void;
  onBackspace: () => void;
  onKeyPress: (num: string) => void;
}

const DIAL_KEYS = [
  { num: '1', lets: ' ' },
  { num: '2', lets: 'ABC' },
  { num: '3', lets: 'DEF' },
  { num: '4', lets: 'GHI' },
  { num: '5', lets: 'JKL' },
  { num: '6', lets: 'MNO' },
  { num: '7', lets: 'PQRS' },
  { num: '8', lets: 'TUV' },
  { num: '9', lets: 'WXYZ' },
  { num: '*', lets: '' },
  { num: '0', lets: '+' },
  { num: '#', lets: '' }
];

export const DialPad: React.FC<DialPadProps> = ({
  destination,
  setDestination,
  onMakeCall,
  onBackspace,
  onKeyPress
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input automatically on mount for quick dialing
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onMakeCall(destination, false);
    }
  };

  return (
    <div className="dialer-view" role="region" aria-label="Phone Dialer">
      <div className="destination-box">
        <label htmlFor="dialer-destination-input" className="sr-only">
          Dial extension or phone number
        </label>
        <input
          ref={inputRef}
          id="dialer-destination-input"
          type="text"
          className="destination-input"
          value={destination}
          onChange={e => setDestination(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Extension or phone number..."
          autoComplete="off"
          aria-label="Destination phone number"
        />
        {destination && (
          <button
            type="button"
            className="backspace-btn"
            onClick={onBackspace}
            aria-label="Backspace delete character"
            title="Delete character"
          >
            <Delete size={20} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="dialpad" role="group" aria-label="Numeric Keypad">
        {DIAL_KEYS.map(k => (
          <button
            key={k.num}
            type="button"
            className="dialpad-key"
            onClick={() => {
              onKeyPress(k.num);
              inputRef.current?.focus();
            }}
            aria-label={`Digit ${k.num} ${k.lets}`.trim()}
          >
            <span className="key-number">{k.num}</span>
            <span className="key-letters">{k.lets || '\u00A0'}</span>
          </button>
        ))}
      </div>

      <div className="dial-actions">
        <Button
          variant="amber"
          size="lg"
          onClick={() => onMakeCall(destination, false)}
          disabled={!destination.trim()}
          icon={<Phone size={18} aria-hidden="true" />}
          className="dial-btn"
          aria-label="Start voice call"
        >
          Call
        </Button>
        <Button
          variant="secondary"
          size="lg"
          onClick={() => onMakeCall(destination, true)}
          disabled={!destination.trim()}
          icon={<Video size={18} aria-hidden="true" />}
          className="dial-video-btn"
          aria-label="Start video call"
        >
          Video
        </Button>
      </div>
    </div>
  );
};
