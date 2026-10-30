import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleClearDataAndReload = async () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      window.location.reload();
    } catch (e) {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      const isTranslationError =
        this.state.error?.name === 'NotFoundError' ||
        (this.state.error?.message &&
          (this.state.error.message.includes('removeChild') ||
            this.state.error.message.includes('insertBefore') ||
            this.state.error.message.includes('not a child of this node')));

      return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-card border border-border rounded-2xl p-6 shadow-xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">
                {isTranslationError ? 'Browser Translation Conflict' : 'Something went wrong'}
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {isTranslationError
                  ? 'Chrome/Google Translate mutated page elements during rendering. Your images, API keys, and drafts are 100% safe. Use the built-in EN/عربي toggle in the app header instead of browser translation.'
                  : 'An unexpected interface error occurred. Your local stock images and API keys remain safe in your browser storage.'}
              </p>
            </div>

            {this.state.error && (
              <div className="text-left bg-secondary/50 border border-border/80 rounded-lg p-3 text-[11px] font-mono text-red-400 overflow-x-auto max-h-48 whitespace-pre-wrap">
                <div className="font-bold">{this.state.error.toString()}</div>
                {this.state.error.stack && (
                  <div className="text-[10px] text-muted-foreground mt-1 opacity-80">{this.state.error.stack}</div>
                )}
                {this.state.errorInfo?.componentStack && (
                  <div className="text-[9px] text-sky-400/80 mt-1">{this.state.errorInfo.componentStack}</div>
                )}
              </div>
            )}

            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reload App
              </button>
              <button
                type="button"
                onClick={this.handleClearDataAndReload}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-secondary/50 text-foreground text-xs hover:bg-secondary transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                Reset Cache & Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
