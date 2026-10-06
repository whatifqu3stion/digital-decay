import React, { Component, ErrorInfo, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught runtime error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', backgroundColor: '#000', color: '#00ffd5', padding: '2rem', fontFamily: 'monospace' }}>
          <div style={{ border: '2px solid #ff007f', padding: '1.5rem', maxWidth: '600px', margin: '2rem auto', background: '#0a0005' }}>
            <h1 style={{ color: '#ff007f', fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem', letterSpacing: '0.1em' }}>
              :: SYSTEM HALT // RUNTIME FAULT ::
            </h1>
            <p style={{ color: '#e5e5e5', fontSize: '0.875rem', marginBottom: '1.5rem', lineHeight: '1.5' }}>
              {this.state.error?.message || "An unexpected error occurred during execution."}
            </p>
            <button
              onClick={() => {
                try {
                  localStorage.clear();
                  sessionStorage.clear();
                  indexedDB.deleteDatabase('digital_decay_db');
                } catch (_) {}
                window.location.reload();
              }}
              style={{
                backgroundColor: '#00ffd5',
                color: '#000',
                border: 'none',
                padding: '0.75rem 1.5rem',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                cursor: 'pointer',
                letterSpacing: '0.1em'
              }}
            >
              [ ⟲ CLEAR STORAGE & REBOOT ]
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
