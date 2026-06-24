import { Routes, Route } from 'react-router-dom'
import { GeneralStockLayout } from './layouts/GeneralStockLayout'
import { StockList } from './pages/StockList'

export function GeneralStockApp() {
  return (
    <Routes>
      <Route element={<GeneralStockLayout />}>
        <Route index element={<StockList />} />
      </Route>
    </Routes>
  )
}
