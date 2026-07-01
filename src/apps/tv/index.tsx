import { Routes, Route } from 'react-router-dom'
import { TvDisplay } from './pages/TvDisplay'
import { AdminView } from './pages/Admin'

export function TvApp() {
  return (
    <Routes>
      <Route index element={<TvDisplay />} />
      <Route path="admin" element={<AdminView />} />
    </Routes>
  )
}
