import React from 'react';
import { Phone, X } from 'lucide-react';

interface DialPadProps {
  destination: string;
  setDestination: (dest: string | ((prev: string) => string)) => void;
  onMakeCall: () => void;
  onBackspace: () => void;
  onKeyPress: (num: string) => void;
}

const KEYS = [
  { num: '1', lets: '' }, { num: '2', lets: 'abc' }, { num: '3', lets: 'def' },
  { num: '4', lets: 'ghi' }, { num: '5', lets: 'jkl' }, { num: '6', lets: 'mno' },
  { num: '7', lets: 'pqrs' }, { num: '8', lets: 'tuv' }, { num: '9', lets: 'wxyz' },
  { num: '*', lets: '' }, { num: '0', lets: '+' }, { num: '#', lets: '' }
];

export const DialPad: React.FC<DialPadProps> = ({
  destination,
  setDestination,
  onMakeCall,
  onBackspace,
  onKeyPress
}) => {
  return (
    <div className="dialer-view">
      <div className="destination-box">
        <input 
          type="text" 
          className="destination-input" 
          value={destination}
          onChange={e => setDestination(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              onMakeCall();
            }
          }}
          placeholder="Enter extension or trunk number..."
        />
        {destination && (
          <button className="backspace-btn" onClick={onBackspace}>
            <X size={18} />
          </button>
        )}
      </div>

      <div className="dialpad">
        {KEYS.map(k => (
          <div key={k.num} className="dialpad-key" onClick={() => onKeyPress(k.num)}>
            <span className="key-number">{k.num}</span>
            <span className="key-letters">{k.lets}</span>
          </div>
        ))}
      </div>

      <div className="dial-actions">
        <button className="btn btn-primary" onClick={onMakeCall} style={{ background: 'var(--amber-color)', color: '#fff' }}>
          <Phone size={16} /> Dial
        </button>
      </div>
    </div>
  );
};
