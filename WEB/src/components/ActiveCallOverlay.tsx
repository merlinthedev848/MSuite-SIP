import React from 'react';
import { User, Mic, Play, PhoneCall, PhoneOff } from 'lucide-react';
import type { ActiveCall } from '../types';

interface ActiveCallOverlayProps {
  call: ActiveCall;
  onToggleMute: () => void;
  onToggleHold: () => void;
  onHangUp: () => void;
}

export const ActiveCallOverlay: React.FC<ActiveCallOverlayProps> = ({
  call,
  onToggleMute,
  onToggleHold,
  onHangUp
}) => {
  const durationText = `${Math.floor(call.duration / 60)}:${(call.duration % 60).toString().padStart(2, '0')}`;

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

        <button className="call-action-btn" onClick={() => alert('Transferring call... (Not supported in standalone mode)')}>
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
