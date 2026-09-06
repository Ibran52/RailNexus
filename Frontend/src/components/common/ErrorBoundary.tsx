/**
 * ErrorBoundary.tsx — RailNexus Frontend
 * React class-based Error Boundary.
 * Prevents blank white screen on runtime React errors.
 * Displays an operational RailNexus recovery card.
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    // In production, this could forward to a monitoring service (e.g., Sentry)
    console.error('[RailNexus ErrorBoundary]', error, errorInfo);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-6">
        <div className="max-w-lg w-full bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-8 flex flex-col items-center text-center gap-5">
          <div className="p-4 rounded-full bg-rose-900/40 border border-rose-700/50">
            <AlertTriangle className="h-10 w-10 text-rose-400" />
          </div>

          <div>
            <h1 className="text-xl font-bold text-white font-sans mb-1">
              {this.props.fallbackTitle || 'RailNexus — Application Error'}
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              An unexpected error has occurred in the operational interface.
              The error has been recorded. Reload the page to resume operations.
            </p>
          </div>

          {this.state.error && (
            <div className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-left">
              <p className="text-xs font-mono text-rose-300 break-all">
                {this.state.error.message}
              </p>
            </div>
          )}

          <button
            id="error-boundary-reload-btn"
            onClick={this.handleReload}
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 transition-colors text-white font-bold px-6 py-2.5 rounded-lg text-sm"
          >
            <RefreshCw className="h-4 w-4" />
            Reload RailNexus
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
