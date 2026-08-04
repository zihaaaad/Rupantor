import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="app-wrapper">
        <div style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div className="modal-content" style={{ width: 460 }}>
            <div className="modal-header" style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px' }}>
              <div className="bento-icon" style={{ marginBottom: 0, color: '#F43F5E' }}><AlertTriangle size={24} /></div>
              <div>
                <h2 className="modal-title">Something went wrong</h2>
                <p className="modal-subtitle">Rupantor hit an unexpected error and needs to restart.</p>
              </div>
            </div>
            <div className="modal-body">
              <div className="waterfall-container" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'monospace', wordBreak: 'break-word' }}>
                {this.state.error.message}
              </div>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'stretch' }}>
              <button className="add-asset-btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => window.location.reload()}>
                Restart Rupantor
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
