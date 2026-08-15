import { Routes, Route } from 'react-router-dom'
import { ChamadosLayout } from './layouts/ChamadosLayout'
import { Dashboard } from './pages/Dashboard'
import { SlaDashboard } from './pages/SlaDashboard'
import { TicketList } from './pages/TicketList'
import { TicketDetail } from './pages/TicketDetail'
import { RoomList } from './pages/RoomList'
import { RoomForm } from './pages/RoomForm'
import { UnitQR } from './pages/UnitQR'
import { Settings } from './pages/Settings'

export function ChamadosApp() {
  return (
    <Routes>
      <Route element={<ChamadosLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="sla" element={<SlaDashboard />} />
        <Route path="tickets" element={<TicketList />} />
        <Route path="tickets/:id" element={<TicketDetail />} />
        <Route path="rooms" element={<RoomList />} />
        <Route path="rooms/new" element={<RoomForm />} />
        <Route path="rooms/:id/edit" element={<RoomForm />} />
        <Route path="qr" element={<UnitQR />} />
        <Route path="settings" element={<Settings />} />
        </Route>
    </Routes>
  )
}
