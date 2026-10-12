import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { StockLayout } from './layouts/StockLayout'
import { StockDashboard } from './pages/StockDashboard'
import { StockSectionPage } from './pages/StockSection'
import { StockDetail } from './pages/StockDetail'
import { MovementsPage } from './pages/MovementsPage'
import { InventoryList } from './pages/InventoryList'
import { InventoryDetail } from './pages/InventoryDetail'
import { StockEntryExit } from './pages/StockEntryExit'
import { StockMaintenance } from './pages/StockMaintenance'
import { StockEquipamentosListPage } from './pages/StockEquipamentosListPage'
import { StockEquipamentoDetailPage } from './pages/StockEquipamentoDetailPage'
import { stockNavPath, stockPrefix } from './utils/stockPath'

/**
 * URLs antigas aposentadas na simplificação da navegação do Stock
 * (Pipeline, Kits e QR Code saíram da interface; ver issue #289).
 * Redireciona preservando o prefixo atual (/stock ou /general-stock).
 */
function LegacyStockRedirect({ to }: { to: string }) {
  const location = useLocation()
  const target = to === '/stock' ? stockPrefix(location.pathname) : stockNavPath(location.pathname, to)
  return <Navigate to={target} replace />
}

export function StockApp() {
  return (
    <Routes>
      <Route path="qr-scan" element={<LegacyStockRedirect to="/stock" />} />
      <Route element={<StockLayout />}>
        <Route index element={<StockDashboard />} />
        <Route path="items" element={<StockSectionPage />} />
        <Route path="items/:id" element={<StockDetail />} />
        <Route path="equipamentos" element={<StockEquipamentosListPage />} />
        <Route path="equipamentos/:id" element={<StockEquipamentoDetailPage />} />
        <Route path="movements" element={<MovementsPage />} />
        <Route path="inventory" element={<InventoryList />} />
        <Route path="inventory/:id" element={<InventoryDetail />} />
        <Route path="entry-exit" element={<StockEntryExit />} />
        <Route path="maintenance" element={<StockMaintenance />} />
        {/* Rotas antigas: acesso seguro por redirecionamento (sem 404). */}
        <Route path="pipeline" element={<LegacyStockRedirect to="/stock/items" />} />
        <Route path="kits" element={<LegacyStockRedirect to="/stock/items" />} />
        <Route path="kits/:id" element={<LegacyStockRedirect to="/stock/items" />} />
        <Route path="qr" element={<LegacyStockRedirect to="/stock" />} />
      </Route>
    </Routes>
  )
}
