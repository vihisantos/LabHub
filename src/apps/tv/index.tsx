import { Component, type ReactNode, type ErrorInfo } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ToastProvider } from '../../lib/ToastContext'
import { ErrorBoundary } from '../../lib/ErrorBoundary'
import { MusicPlayerProvider } from './contexts/MusicPlayerContext'
import { TvDisplay } from './pages/TvDisplay'
import { AdminView } from './pages/Admin'

/**
 * ErrorBoundary especial para o modo display da TV.
 * Ao invés de mostrar um botão "Tentar novamente" (que ninguém vai clicar
 * na TV), ele auto-recarrega a página após 5 segundos.
 */
class TvDisplayErrorBoundary extends Component<{ children: ReactNode }> {
  state = { hasError: false, error: null as Error | null }
  reloadTimer: ReturnType<typeof setTimeout> | null = null

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[TV] ErrorBoundary caught:', error, info.componentStack)
    // Auto-reload após 5 segundos para recuperação automática
    this.reloadTimer = setTimeout(() => {
      window.location.reload()
    }, 5000)
  }

  componentWillUnmount() {
    if (this.reloadTimer) clearTimeout(this.reloadTimer)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          width: '100vw', height: '100vh',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#080a14', color: '#64748b',
          gap: '1rem', fontFamily: 'system-ui, sans-serif',
        }}>
          <p style={{ fontSize: '1.25rem', fontWeight: 600, color: '#94a3b8' }}>
            Algo deu errado
          </p>
          <p style={{ fontSize: '0.85rem', color: '#475569' }}>
            Recarregando automaticamente...
          </p>
        </div>
      )
    }
    return this.props.children
  }
}

export function TvApp() {
  return (
    <ToastProvider>
      <MusicPlayerProvider>
        <Routes>
          <Route index element={<ErrorBoundary><AdminView /></ErrorBoundary>} />
          <Route path="display" element={
            <TvDisplayErrorBoundary>
              <TvDisplay />
            </TvDisplayErrorBoundary>
          } />
          <Route path="*" element={<Navigate to="/tv" replace />} />
        </Routes>
      </MusicPlayerProvider>
    </ToastProvider>
  )
}
