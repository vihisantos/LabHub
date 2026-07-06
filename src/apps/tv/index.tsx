import { Routes, Route, Navigate } from 'react-router-dom'
import { ToastProvider } from '../../lib/ToastContext'
import { ErrorBoundary } from '../../lib/ErrorBoundary'
import { MusicPlayerProvider } from './contexts/MusicPlayerContext'
import { TvDisplay } from './pages/TvDisplay'
import { AdminView } from './pages/Admin'

export function TvApp() {
  return (
    <ToastProvider>
      <MusicPlayerProvider>
        <Routes>
          <Route index element={<ErrorBoundary><AdminView /></ErrorBoundary>} />
          <Route path="display" element={
            <ErrorBoundary>
              <TvDisplay />
            </ErrorBoundary>
          } />
          <Route path="*" element={<Navigate to="/tv" replace />} />
        </Routes>
      </MusicPlayerProvider>
    </ToastProvider>
  )
}
