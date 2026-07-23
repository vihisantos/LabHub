import { Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '../../lib/ThemeContext'
import { PublicLayout } from './layouts/PublicLayout'
import { QRScan } from './pages/QRScan'
import { RoomAssets } from './pages/RoomAssets'
import { TicketForm } from './pages/TicketForm'
import { TicketSuccess } from './pages/TicketSuccess'

export function ChamadosPublicApp() {
  return (
    <ThemeProvider storageKey="chamados_public_theme" defaultTheme="light">
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<QRScan />} />
          <Route path="room/:roomId" element={<RoomAssets />} />
          <Route path="new" element={<TicketForm />} />
          <Route path="success/:ticketId" element={<TicketSuccess />} />
        </Route>
      </Routes>
    </ThemeProvider>
  )
}
