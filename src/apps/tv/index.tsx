import { Routes, Route, Navigate } from 'react-router-dom'
import { ToastProvider } from '../../lib/ToastContext'
import { ErrorBoundary } from '../../lib/ErrorBoundary'
import { MusicPlayerCommandProvider } from './contexts/MusicPlayerCommandContext'
import { AdminView } from './pages/Admin'

export function TvApp() {
  return (
    <ToastProvider>
      <MusicPlayerCommandProvider>
        <Routes>
          <Route index element={<ErrorBoundary><AdminView /></ErrorBoundary>} />
          <Route path="*" element={<Navigate to="/tv" replace />} />
        </Routes>
      </MusicPlayerCommandProvider>
    </ToastProvider>
  )
}
