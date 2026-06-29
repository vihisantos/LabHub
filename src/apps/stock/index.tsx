import { Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '../../lib/ThemeContext'
import { StockLayout } from './layouts/StockLayout'
import { StockDashboard } from './pages/StockDashboard'
import { StockSectionPage } from './pages/StockSection'
import { StockDetail } from './pages/StockDetail'
import { MovementsPage } from './pages/MovementsPage'
import { KitList } from './pages/KitList'
import { KitDetail } from './pages/KitDetail'
import { InventoryList } from './pages/InventoryList'
import { InventoryDetail } from './pages/InventoryDetail'

export function StockApp() {
  return (
    <ThemeProvider storageKey="stock_theme" defaultTheme="dark">
      <Routes>
        <Route element={<StockLayout />}>
          <Route index element={<StockDashboard />} />
          <Route path="items" element={<StockSectionPage />} />
          <Route path="items/:id" element={<StockDetail />} />
          <Route path="movements" element={<MovementsPage />} />
          <Route path="kits" element={<KitList />} />
          <Route path="kits/:id" element={<KitDetail />} />
          <Route path="inventory" element={<InventoryList />} />
          <Route path="inventory/:id" element={<InventoryDetail />} />
        </Route>
      </Routes>
    </ThemeProvider>
  )
}
