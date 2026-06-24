import { Routes, Route } from 'react-router-dom'
import { RootLayout } from './layouts/RootLayout'
import { Dashboard } from './pages/Dashboard'
import { PCList } from './pages/PCList'
import { PCForm } from './pages/PCForm'
import { PCDetail } from './pages/PCDetail'
import { PartsList } from './pages/PartsList'
import { AssetScanner } from './pages/AssetScanner'
import { QRGenerator } from './pages/QRGenerator'
import { ChecklistTemplates } from './pages/ChecklistTemplates'
import { Reports } from './pages/Reports'
import { Maintenance } from './pages/Maintenance'

export function PCareApp() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="pcs" element={<PCList />} />
        <Route path="pcs/new" element={<PCForm />} />
        <Route path="pcs/:id" element={<PCDetail />} />
        <Route path="pcs/:id/edit" element={<PCForm />} />
        <Route path="parts" element={<PartsList />} />
        <Route path="asset-scanner" element={<AssetScanner />} />
        <Route path="qr" element={<QRGenerator />} />
        <Route path="checklists" element={<ChecklistTemplates />} />
        <Route path="reports" element={<Reports />} />
        <Route path="maintenance" element={<Maintenance />} />
      </Route>
    </Routes>
  )
}
