import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
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
        <div className="app-container" style={{ padding: 28, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Merlin SIP encountered an error</h2>
          <p className="item-subtitle" style={{ lineHeight: 1.5 }}>
            {this.state.errorMessage}
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={this.handleReload}>
              Reload App
            </button>
            <button className="btn btn-secondary" onClick={this.handleResetCache}>
              Reset Cache &amp; Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
