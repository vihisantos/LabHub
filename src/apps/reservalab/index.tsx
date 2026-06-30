import { Routes, Route } from 'react-router-dom'
import { ReservaLabLayout } from './layouts/ReservaLabLayout'
import { DashboardView } from './pages/Dashboard'
import { ReservasView } from './pages/Reservas'
import { TabletsView } from './pages/Tablets'

export function ReservaLabApp() {
  return (
    <Routes>
      <Route element={<ReservaLabLayout />}>
        <Route index element={<DashboardView />} />
        <Route path="reservas" element={<ReservasView />} />
        <Route path="tablets" element={<TabletsView />} />
      </Route>
    </Routes>
  )
}
