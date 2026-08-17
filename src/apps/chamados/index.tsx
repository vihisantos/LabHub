import { Routes, Route } from 'react-router-dom'
import { ChamadosLayout } from './layouts/ChamadosLayout'
import { Dashboard } from './pages/Dashboard'
import { SlaDashboard } from './pages/SlaDashboard'
import { Reports } from './pages/Reports'
import { Ranking } from './pages/Ranking'
import { TicketList } from './pages/TicketList'
import { TicketDetail } from './pages/TicketDetail'
import { UnitQR } from './pages/UnitQR'
import { Settings } from './pages/Settings'

export function ChamadosApp() {
  return (
    <Routes>
      <Route element={<ChamadosLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="sla" element={<SlaDashboard />} />
        <Route path="reports" element={<Reports />} />
        <Route path="ranking" element={<Ranking />} />
        <Route path="tickets" element={<TicketList />} />
        <Route path="tickets/:id" element={<TicketDetail />} />
        <Route path="qr" element={<UnitQR />} />
        <Route path="settings" element={<Settings />} />
        </Route>
    </Routes>
  )
}
