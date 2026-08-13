import { Routes, Route } from 'react-router-dom'
import { PublicLayout } from './layouts/PublicLayout'
import { QRScan } from './pages/QRScan'
import { RoomAssets } from './pages/RoomAssets'
import { RoomTicketForm } from './pages/RoomTicketForm'
import { TicketForm } from './pages/TicketForm'
import { TicketSuccess } from './pages/TicketSuccess'
import { TrackPage } from './pages/TrackPage'
import { FeedbackPage } from './pages/FeedbackPage'

export function ChamadosPublicApp() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<QRScan />} />
        <Route path="room/:roomId" element={<RoomAssets />} />
        <Route path="new" element={<RoomTicketForm />} />
        <Route path="new-asset" element={<TicketForm />} />
        <Route path="success/:ticketId" element={<TicketSuccess />} />
        <Route path="track" element={<TrackPage />} />
        <Route path="feedback/:ticketId" element={<FeedbackPage />} />
        </Route>
    </Routes>
  )
}
