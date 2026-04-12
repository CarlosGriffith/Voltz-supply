import React from 'react';

type Props = { children: React.ReactNode };

type State = { error: Error | null };

/**
 * Catches render errors so a failed child does not blank the entire app shell.
 */
export class RouteErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
          <div className="max-w-lg w-full rounded-xl border border-red-200 bg-white p-6 shadow-sm">
            <h1 className="text-lg font-bold text-[#1a2332] mb-2">Something went wrong</h1>
            <p className="text-sm text-gray-600 mb-4">
              This page hit an error while rendering. Open the browser developer console (F12) for details, or go back
              and try again.
            </p>
            <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-auto text-red-700 whitespace-pre-wrap">
              {this.state.error.message}
            </pre>
            <button
              type="button"
              className="mt-4 px-4 py-2 rounded-lg bg-[#1a2332] text-white text-sm font-medium hover:bg-[#0f1923]"
              onClick={() => {
                this.setState({ error: null });
                window.location.assign('/login');
              }}
            >
              Back to login
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
