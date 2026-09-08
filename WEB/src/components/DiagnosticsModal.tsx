import React from 'react';
import { X } from 'lucide-react';

interface DiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  diagStatus: string;
  diagLogs: string;
  diagRunning: boolean;
  diagComplete: boolean;
  diagPass: boolean;
  onRunDiagnostics: () => void;
  onAbortDiagnostics: () => void;
}

export const DiagnosticsModal: React.FC<DiagnosticsModalProps> = ({
  isOpen,
  onClose,
  diagStatus,
  diagLogs,
  diagRunning,
  diagComplete,
  diagPass,
  onRunDiagnostics,
  onAbortDiagnostics
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ width: 480 }}>
        <div className="modal-header">
          <span className="modal-title">Network Diagnostics</span>
          <button 
            className="modal-close-btn" 
            disabled={diagRunning}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>
        
        <div className="modal-body">
          <div className="diagnostic-container">
            <div className="diag-header">
              <span 
                className="diag-status-text" 
                style={{ 
                  color: diagComplete 
                    ? (diagPass ? 'var(--success-color)' : '#f59e0b') 
                    : 'var(--ink-color)' 
                }}
              >
                {diagStatus}
              </span>
            </div>
            <div className="diag-console" id="diagConsole">
              {diagLogs}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          {diagRunning ? (
            <button className="btn btn-danger" onClick={onAbortDiagnostics}>
              Abort
            </button>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={onClose}>Close</button>
              <button className="btn btn-primary" onClick={onRunDiagnostics}>Re-run</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
