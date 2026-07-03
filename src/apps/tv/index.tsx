import { Routes, Route } from 'react-router-dom'
import { ToastProvider } from '../../lib/ToastContext'
import { ErrorBoundary } from '../../lib/ErrorBoundary'
import { TvDisplay } from './pages/TvDisplay'
import { AdminView } from './pages/Admin'

export function TvApp() {
  return (
    <ToastProvider>
      <Routes>
        <Route index element={<AdminView />} />
        <Route path="display" element={
          <ErrorBoundary>
            <TvDisplay />
          </ErrorBoundary>
        } />
      </Routes>
    </ToastProvider>
  )
}
