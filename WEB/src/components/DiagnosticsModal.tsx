import React, { useEffect, useRef } from 'react';
import { Activity, Play, Square } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';

export interface DiagnosticsModalProps {
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
  const consoleRef = useRef<HTMLDivElement>(null);

  // Auto-scroll console to bottom as logs stream in
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [diagLogs]);

  const modalFooter = (
    <div className="diag-modal-actions">
      {diagRunning ? (
        <Button
          variant="danger"
          icon={<Square size={16} aria-hidden="true" />}
          onClick={onAbortDiagnostics}
        >
          Abort Diagnostics
        </Button>
      ) : (
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            icon={<Play size={16} aria-hidden="true" />}
            onClick={onRunDiagnostics}
          >
            Re-run Checks
          </Button>
        </>
      )}
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Network Diagnostics"
      footer={modalFooter}
      disableClose={diagRunning}
      maxWidth={540}
    >
      <div className="diagnostic-container">
        <div className="diag-header">
          <div className="diag-status-badge">
            <Activity
              size={16}
              className={diagRunning ? 'spin-icon' : ''}
              aria-hidden="true"
            />
            <span
              className={`diag-status-text ${
                diagComplete
                  ? diagPass
                    ? 'status-pass'
                    : 'status-warn'
                  : 'status-running'
              }`}
              aria-live="polite"
            >
              {diagStatus}
            </span>
          </div>
        </div>

        <div
          ref={consoleRef}
          className="diag-console"
          role="log"
          aria-live="polite"
          aria-label="Diagnostic execution log output"
          tabIndex={0}
        >
          {diagLogs || 'Ready to execute diagnostics...'}
        </div>
      </div>
    </Modal>
  );
};
