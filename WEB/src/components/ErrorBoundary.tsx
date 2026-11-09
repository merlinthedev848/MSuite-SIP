import React from 'react';
import { AlertTriangle, RotateCcw, RefreshCw } from 'lucide-react';
import { Button } from './ui/Button';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : 'An unexpected runtime error occurred.'
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error('[Merlin SIP ErrorBoundary]', error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleResetCache = (): void => {
    try {
      localStorage.removeItem('merlin_sip_config');
      localStorage.removeItem('merlin_sip_history');
    } catch {
      // Ignore storage errors in restricted contexts
    }
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="error-fallback-container" role="alert">
          <div className="error-fallback-card">
            <div className="error-icon-wrapper" aria-hidden="true">
              <AlertTriangle size={32} />
            </div>
            <h2 className="error-fallback-title">Something went wrong</h2>
            <p className="error-fallback-desc">
              Merlin SIP encountered an unexpected runtime error. You can reload the application or reset stored cached data.
            </p>
            <div className="error-msg-box" tabIndex={0}>
              <code>{this.state.errorMessage}</code>
            </div>
            <div className="error-fallback-actions">
              <Button
                variant="primary"
                icon={<RefreshCw size={16} aria-hidden="true" />}
                onClick={this.handleReload}
              >
                Reload Application
              </Button>
              <Button
                variant="danger"
                icon={<RotateCcw size={16} aria-hidden="true" />}
                onClick={this.handleResetCache}
              >
                Reset Cache &amp; Reload
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
