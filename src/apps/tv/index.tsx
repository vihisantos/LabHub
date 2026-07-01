import { Routes, Route } from 'react-router-dom'
import { ToastProvider } from '../../lib/ToastContext'
import { TvDisplay } from './pages/TvDisplay'
import { AdminView } from './pages/Admin'

export function TvApp() {
  return (
    <ToastProvider>
      <Routes>
        <Route index element={<TvDisplay />} />
        <Route path="admin" element={<AdminView />} />
      </Routes>
    </ToastProvider>
  )
}
