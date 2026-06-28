import { Routes, Route } from 'react-router-dom'
import { StockLayout } from './layouts/StockLayout'
import { StockDashboard } from './pages/StockDashboard'
import { StockSectionPage } from './pages/StockSection'
import { StockDetail } from './pages/StockDetail'
import { MovementsPage } from './pages/MovementsPage'
import { KitList } from './pages/KitList'
import { KitDetail } from './pages/KitDetail'

export function StockApp() {
  return (
    <Routes>
      <Route element={<StockLayout />}>
        <Route index element={<StockDashboard />} />
        <Route path="items" element={<StockSectionPage />} />
        <Route path="items/:id" element={<StockDetail />} />
        <Route path="movements" element={<MovementsPage />} />
        <Route path="kits" element={<KitList />} />
        <Route path="kits/:id" element={<KitDetail />} />
      </Route>
    </Routes>
  )
}
