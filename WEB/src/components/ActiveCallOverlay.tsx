import React, { useState } from 'react';
import { User, Mic, MicOff, Play, Pause, PhoneCall, PhoneOff, ArrowRight } from 'lucide-react';
import type { ActiveCall } from '../types';

export interface ActiveCallOverlayProps {
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
  const [showTransferInput, setShowTransferInput] = useState(false);
  const [transferTarget, setTransferTarget] = useState('');

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const target = transferTarget.trim();
    if (!target) return;

    if (onTransfer) {
      onTransfer(target);
    }
    setShowTransferInput(false);
    setTransferTarget('');
  };

  const getStatusText = () => {
    switch (call.state) {
      case 'dialing':
        return 'Dialing...';
      case 'ringing':
        return 'Ringing...';
      case 'connected':
        return `Connected (${formatDuration(call.duration)})`;
      case 'hold':
        return 'Call On Hold';
      default:
        return 'Active Call';
    }
  };

  const isHold = call.state === 'hold';

  return (
    <div
      className="active-call-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Call with ${call.destination}`}
    >
      <div className={`call-avatar ${call.state === 'ringing' ? 'pulse-avatar' : ''}`}>
        <User size={38} aria-hidden="true" />
      </div>

      <div className="call-target">{call.destination}</div>
      <div className={`call-status ${isHold ? 'call-status-hold' : ''}`} aria-live="polite">
        {getStatusText()}
      </div>

      {showTransferInput && (
        <form onSubmit={handleTransferSubmit} className="transfer-box" role="search">
          <label htmlFor="transfer-target-input" className="sr-only">
            Transfer target extension
          </label>
          <input
            id="transfer-target-input"
            type="text"
            className="form-input transfer-input"
            placeholder="Transfer to ext..."
            value={transferTarget}
            onChange={e => setTransferTarget(e.target.value)}
            autoFocus
          />
          <button
            type="submit"
            className="transfer-confirm-btn"
            disabled={!transferTarget.trim()}
            aria-label="Confirm transfer"
          >
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </form>
      )}

      <div className="call-actions-grid" role="group" aria-label="Call controls">
        <button
          type="button"
          className={`call-action-btn ${call.muted ? 'active' : ''}`}
          onClick={onToggleMute}
          aria-pressed={call.muted}
          aria-label={call.muted ? 'Unmute microphone' : 'Mute microphone'}
        >
          <div className="action-icon-circle">
            {call.muted ? <MicOff size={20} aria-hidden="true" /> : <Mic size={20} aria-hidden="true" />}
          </div>
          <span>{call.muted ? 'Muted' : 'Mute'}</span>
        </button>

        <button
          type="button"
          className={`call-action-btn ${isHold ? 'active' : ''}`}
          onClick={onToggleHold}
          aria-pressed={isHold}
          aria-label={isHold ? 'Resume active call' : 'Put call on hold'}
        >
          <div className="action-icon-circle">
            {isHold ? <Play size={20} aria-hidden="true" /> : <Pause size={20} aria-hidden="true" />}
          </div>
          <span>{isHold ? 'Resume' : 'Hold'}</span>
        </button>

        <button
          type="button"
          className={`call-action-btn ${showTransferInput ? 'active' : ''}`}
          onClick={() => setShowTransferInput(prev => !prev)}
          aria-expanded={showTransferInput}
          aria-label="Transfer call to another extension"
        >
          <div className="action-icon-circle">
            <PhoneCall size={20} aria-hidden="true" />
          </div>
          <span>Transfer</span>
        </button>
      </div>

      <div className="hangup-action">
        <button
          type="button"
          className="hangup-btn"
          onClick={onHangUp}
          aria-label="End call"
          title="End call"
        >
          <PhoneOff size={24} aria-hidden="true" />
          <span className="sr-only">End Call</span>
        </button>
      </div>
    </div>
  );
};
