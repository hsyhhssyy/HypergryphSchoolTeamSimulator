/**
 * ErrorBoundary — todo 24. A CLASS component (Preact supports
 * `componentDidCatch`) wrapping <App/> in main.tsx so a render/lifecycle
 * crash shows a friendly fallback instead of a white screen.
 *
 * Contract:
 * - `componentDidCatch` records the failure and LOGS the raw error via
 *   console.error ONLY — the raw text/stack never reaches the UI. This
 *   satisfies "MUST NOT show raw error messages".
 * - The fallback is a static friendly screen ("页面出错了") with a reload
 *   button — no error details, no stack trace.
 * - Unhandled promise rejections are NOT caught by any boundary (they never
 *   white-screen a Preact app by themselves); main.tsx logs them globally so
 *   nothing is silently swallowed.
 */
import { Component } from 'preact';
import type { ComponentChildren } from 'preact';

export interface ErrorBoundaryProps {
  children: ComponentChildren;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  /** Record the crash; raw error goes to the console, never to the UI. */
  override componentDidCatch(error: unknown): void {
    console.error('渲染出错:', error);
    this.setState({ hasError: true });
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  override render() {
    if (this.state.hasError) {
      return (
        <main className="screen error-fallback" role="alert">
          <h1 className="font-display error-fallback__title">页面出错了</h1>
          <p className="error-fallback__text">发生了一点小问题，请重新加载页面</p>
          <button
            type="button"
            className="btn btn--primary error-fallback__reload"
            data-testid="error-fallback-reload"
            onClick={this.handleReload}
          >
            重新加载
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
