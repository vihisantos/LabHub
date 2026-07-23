import { Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '../../lib/ThemeContext'
import { ToastProvider } from '../../lib/ToastContext'
import { LabProvider } from '../../lib/useLabContext'
import { RootLayout } from './layouts/RootLayout'
import { Dashboard } from './pages/Dashboard'
import { PCList } from './pages/PCList'
import { PCForm } from './pages/PCForm'
import { PCDetail } from './pages/PCDetail'
import { PartsList } from './pages/PartsList'
import { QRGenerator } from './pages/QRGenerator'
import { QRScanner } from './pages/QRScanner'
import { ChecklistTemplates } from './pages/ChecklistTemplates'
import { ChecklistExecute } from './pages/ChecklistExecute'
import { Reports } from './pages/Reports'
import { Maintenance } from './pages/Maintenance'
import { Settings } from './pages/Settings'
import { StockConsolidado } from './pages/StockConsolidado'
import { ErrorBoundary } from '../../lib/ErrorBoundary'

function EB({ children }: { children: React.ReactNode }) {
  return <ErrorBoundary>{children}</ErrorBoundary>
}

export function PCCareApp() {
  return (
    <ThemeProvider storageKey="pcare_theme" defaultTheme="dark">
      <ToastProvider>
        <LabProvider>
          <Routes>
            <Route path="scanner" element={<QRScanner />} />
            <Route element={<RootLayout />}>
              <Route index element={<EB><Dashboard /></EB>} />
              <Route path="assets" element={<EB><PCList /></EB>} />
              <Route path="assets/new" element={<EB><PCForm /></EB>} />
              <Route path="assets/:id" element={<EB><PCDetail /></EB>} />
              <Route path="assets/:id/edit" element={<EB><PCForm /></EB>} />
              <Route path="pcs" element={<EB><PCList /></EB>} />
              <Route path="pcs/new" element={<EB><PCForm /></EB>} />
              <Route path="pcs/:id" element={<EB><PCDetail /></EB>} />
              <Route path="pcs/:id/edit" element={<EB><PCForm /></EB>} />
              <Route path="parts" element={<EB><PartsList /></EB>} />
              <Route path="parts/consolidado" element={<EB><StockConsolidado /></EB>} />
              <Route path="qr" element={<EB><QRGenerator /></EB>} />
              <Route path="checklists" element={<EB><ChecklistTemplates /></EB>} />
              <Route path="checklists/:templateId/execute" element={<EB><ChecklistExecute /></EB>} />
              <Route path="reports" element={<EB><Reports /></EB>} />
              <Route path="maintenance" element={<EB><Maintenance /></EB>} />
              <Route path="settings" element={<EB><Settings /></EB>} />
            </Route>
          </Routes>
        </LabProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}
