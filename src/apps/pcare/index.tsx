import { Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '../../lib/ThemeContext'
import { RootLayout } from './layouts/RootLayout'
import { Dashboard } from './pages/Dashboard'
import { PCList } from './pages/PCList'
import { PCForm } from './pages/PCForm'
import { BulkPCWizard } from './pages/BulkPCWizard'
import { PCDetail } from './pages/PCDetail'
import { PartsList } from './pages/PartsList'
import { AssetScanner } from './pages/AssetScanner'
import { QRGenerator } from './pages/QRGenerator'
import { ChecklistTemplates } from './pages/ChecklistTemplates'
import { ChecklistExecute } from './pages/ChecklistExecute'
import { Reports } from './pages/Reports'
import { Maintenance } from './pages/Maintenance'
import { Settings } from './pages/Settings'
import { ErrorBoundary } from '../../lib/ErrorBoundary'

function EB({ children }: { children: React.ReactNode }) {
  return <ErrorBoundary>{children}</ErrorBoundary>
}

export function PCareApp() {
  return (
    <ThemeProvider storageKey="pcare_theme" defaultTheme="dark">
      <Routes>
        <Route element={<RootLayout />}>
          <Route index element={<EB><Dashboard /></EB>} />
          <Route path="pcs" element={<EB><PCList /></EB>} />
          <Route path="pcs/new" element={<EB><PCForm /></EB>} />
          <Route path="pcs/bulk" element={<EB><BulkPCWizard /></EB>} />
          <Route path="pcs/:id" element={<EB><PCDetail /></EB>} />
          <Route path="pcs/:id/edit" element={<EB><PCForm /></EB>} />
          <Route path="parts" element={<EB><PartsList /></EB>} />
          <Route path="asset-scanner" element={<EB><AssetScanner /></EB>} />
          <Route path="qr" element={<EB><QRGenerator /></EB>} />
          <Route path="checklists" element={<EB><ChecklistTemplates /></EB>} />
          <Route path="checklists/:templateId/execute" element={<EB><ChecklistExecute /></EB>} />
          <Route path="reports" element={<EB><Reports /></EB>} />
          <Route path="maintenance" element={<EB><Maintenance /></EB>} />
          <Route path="settings" element={<EB><Settings /></EB>} />
        </Route>
      </Routes>
    </ThemeProvider>
  )
}
