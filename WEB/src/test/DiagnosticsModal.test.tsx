import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DiagnosticsModal } from '../components/DiagnosticsModal';

describe('DiagnosticsModal component', () => {
  it('renders status and logs stream', () => {
    render(
      <DiagnosticsModal
        isOpen={true}
        onClose={vi.fn()}
        diagStatus="Testing WebRTC..."
        diagLogs="[INFO] Testing media stack..."
        diagRunning={false}
        diagComplete={true}
        diagPass={true}
        onRunDiagnostics={vi.fn()}
        onAbortDiagnostics={vi.fn()}
      />
    );

    expect(screen.getByRole('dialog', { name: /network diagnostics/i })).toBeInTheDocument();
    expect(screen.getByText('Testing WebRTC...')).toBeInTheDocument();
    expect(screen.getByRole('log')).toHaveTextContent('[INFO] Testing media stack...');
  });

  it('triggers abort when diagnostic check is running', async () => {
    const user = userEvent.setup();
    const handleAbort = vi.fn();

    render(
      <DiagnosticsModal
        isOpen={true}
        onClose={vi.fn()}
        diagStatus="Running ping..."
        diagLogs="Scanning..."
        diagRunning={true}
        diagComplete={false}
        diagPass={true}
        onRunDiagnostics={vi.fn()}
        onAbortDiagnostics={handleAbort}
      />
    );

    const abortBtn = screen.getByRole('button', { name: /abort diagnostics/i });
    await user.click(abortBtn);
    expect(handleAbort).toHaveBeenCalled();
  });
});
