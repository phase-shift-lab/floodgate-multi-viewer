import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('UI error', error, info); }
  render() {
    if (this.state.error) return <main className="fatal-error"><h1>表示中に問題が発生しました</h1><p>設定や閲覧データは端末に残っています。再読み込みしてください。</p><button onClick={() => location.reload()}>再読み込み</button></main>;
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(<ErrorBoundary><App /></ErrorBoundary>);
