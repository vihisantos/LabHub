import { Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '../../lib/ThemeContext'
import { ChamadosLayout } from './layouts/ChamadosLayout'
import { Dashboard } from './pages/Dashboard'
import { TicketList } from './pages/TicketList'
import { TicketDetail } from './pages/TicketDetail'
import { RoomList } from './pages/RoomList'
import { RoomForm } from './pages/RoomForm'
import { RoomQR } from './pages/RoomQR'
import { Settings } from './pages/Settings'

export function ChamadosApp() {
  return (
    <ThemeProvider storageKey="chamados_theme" defaultTheme="dark">
      <Routes>
        <Route element={<ChamadosLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="tickets" element={<TicketList />} />
          <Route path="tickets/:id" element={<TicketDetail />} />
          <Route path="rooms" element={<RoomList />} />
          <Route path="rooms/new" element={<RoomForm />} />
          <Route path="rooms/:id/edit" element={<RoomForm />} />
          <Route path="rooms/:id/qr" element={<RoomQR />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </ThemeProvider>
  )
}
