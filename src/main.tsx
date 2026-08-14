import { render } from 'preact';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

const root = document.getElementById('app');
if (root === null) {
  throw new Error('Missing #app root element');
}

// Any unhandled promise rejection is logged (never silently swallowed).
// Rejections never white-screen a Preact app by themselves; render errors
// are covered by <ErrorBoundary> below.
window.addEventListener('unhandledrejection', (event) => {
  console.error('未处理的 Promise 拒绝:', event.reason);
});

render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
  root,
);
