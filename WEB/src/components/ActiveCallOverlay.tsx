import React from 'react';
import { User, Mic, Play, PhoneCall, PhoneOff } from 'lucide-react';
import type { ActiveCall } from '../types';

interface ActiveCallOverlayProps {
  call: ActiveCall;
  onToggleMute: () => void;
  onToggleHold: () => void;
  onHangUp: () => void;
  onTransfer?: (target: string) => void;
}

export const ActiveCallOverlay: React.FC<ActiveCallOverlayProps> = ({
  call,
  onToggleMute,
  onToggleHold,
  onHangUp,
  onTransfer
}) => {
  const [showTransferInput, setShowTransferInput] = React.useState(false);
  const [transferTarget, setTransferTarget] = React.useState('');
  const durationText = `${Math.floor(call.duration / 60)}:${(call.duration % 60).toString().padStart(2, '0')}`;

  const handleTransfer = () => {
    if (!showTransferInput) {
      setShowTransferInput(true);
      return;
    }
    if (transferTarget.trim()) {
      if (onTransfer) {
        onTransfer(transferTarget.trim());
      }
      setShowTransferInput(false);
      setTransferTarget('');
    }
  };

  return (
    <div className="active-call-overlay">
      <div className="call-avatar">
        <User size={36} />
      </div>
      <div className="call-target">{call.destination}</div>
      <div className="call-status">
        {call.state === 'dialing' && 'Dialing...'}
        {call.state === 'ringing' && 'Ringing...'}
        {call.state === 'connected' && `Connected (${durationText})`}
        {call.state === 'hold' && 'On Hold'}
      </div>

      {showTransferInput && (
        <div style={{ display: 'flex', gap: 6, width: '100%', maxWidth: 260, margin: '8px 0' }}>
          <input 
            type="text" 
            className="form-input" 
            placeholder="Target extension..." 
            value={transferTarget}
            onChange={e => setTransferTarget(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleTransfer(); }}
            style={{ padding: '6px 10px', fontSize: 13 }}
            autoFocus
          />
          <button className="btn btn-primary" onClick={handleTransfer} style={{ padding: '6px 12px', fontSize: 12 }}>
            OK
          </button>
        </div>
      )}

      <div className="call-actions-grid">
        <button 
          className={`call-action-btn ${call.muted ? 'active' : ''}`}
          onClick={onToggleMute}
        >
          <div className="action-icon-circle">
            <Mic size={18} />
          </div>
          <span>Mute</span>
        </button>

        <button 
          className={`call-action-btn ${call.state === 'hold' ? 'active' : ''}`}
          onClick={onToggleHold}
        >
          <div className="action-icon-circle">
            <Play size={18} />
          </div>
          <span>{call.state === 'hold' ? 'Resume' : 'Hold'}</span>
        </button>

        <button 
          className={`call-action-btn ${showTransferInput ? 'active' : ''}`} 
          onClick={handleTransfer}
        >
          <div className="action-icon-circle">
            <PhoneCall size={18} />
          </div>
          <span>Transfer</span>
        </button>
      </div>

      <button className="btn btn-danger" onClick={onHangUp} style={{ width: 140 }}>
        <PhoneOff size={16} /> Hang Up
      </button>
    </div>
  );
};
