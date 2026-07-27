import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import Fx from './components/Fx'
import './styles.css'

// Minimal error boundary so a render-time crash shows a readable message on the
// CRT instead of a blank screen.
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Surface to the DevTools console as well.
    console.error('Renderer crashed:', error, info)
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: '#e08a8a', fontFamily: 'monospace' }}>
          <div style={{ letterSpacing: 2, textTransform: 'uppercase' }}>
            ! renderer error
          </div>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#e8e8ea' }}>
            {String(this.state.error?.stack || this.state.error)}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
      <Fx />
    </ErrorBoundary>
  </React.StrictMode>
)
