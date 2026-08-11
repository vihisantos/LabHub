import { lazy, Suspense, type ReactNode } from 'react'
import { Routes, Route } from 'react-router-dom'
import { ToastProvider } from '../../lib/ToastContext'
import { LabProvider } from '../../lib/useLabContext'
import { RootLayout } from './layouts/RootLayout'
import { LoadingSpinner } from './components/LoadingSpinner'
import { ErrorBoundary } from '../../lib/ErrorBoundary'

const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })))
const PCList = lazy(() => import('./pages/PCList').then((m) => ({ default: m.PCList })))
const PCForm = lazy(() => import('./pages/PCForm').then((m) => ({ default: m.PCForm })))
const PCDetail = lazy(() => import('./pages/PCDetail').then((m) => ({ default: m.PCDetail })))
const PartsList = lazy(() => import('./pages/PartsList').then((m) => ({ default: m.PartsList })))
const QRGenerator = lazy(() => import('./pages/QRGenerator').then((m) => ({ default: m.QRGenerator })))
const QRScanner = lazy(() => import('./pages/QRScanner').then((m) => ({ default: m.QRScanner })))
const ChecklistTemplates = lazy(() => import('./pages/ChecklistTemplates').then((m) => ({ default: m.ChecklistTemplates })))
const ChecklistExecute = lazy(() => import('./pages/ChecklistExecute').then((m) => ({ default: m.ChecklistExecute })))
const Reports = lazy(() => import('./pages/Reports').then((m) => ({ default: m.Reports })))
const Maintenance = lazy(() => import('./pages/Maintenance').then((m) => ({ default: m.Maintenance })))
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })))
const StockConsolidado = lazy(() => import('./pages/StockConsolidado').then((m) => ({ default: m.StockConsolidado })))

function page(element: ReactNode) {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <ErrorBoundary>{element}</ErrorBoundary>
    </Suspense>
  )
}

export function PCCareApp() {
  return (
    <ToastProvider>
      <LabProvider>
        <Routes>
          <Route path="scanner" element={page(<QRScanner />)} />
          <Route element={<RootLayout />}>
            <Route index element={page(<Dashboard />)} />
            <Route path="assets" element={page(<PCList />)} />
            <Route path="assets/new" element={page(<PCForm />)} />
            <Route path="assets/:id" element={page(<PCDetail />)} />
            <Route path="assets/:id/edit" element={page(<PCForm />)} />
            <Route path="pcs" element={page(<PCList />)} />
            <Route path="pcs/new" element={page(<PCForm />)} />
            <Route path="pcs/:id" element={page(<PCDetail />)} />
            <Route path="pcs/:id/edit" element={page(<PCForm />)} />
            <Route path="parts" element={page(<PartsList />)} />
            <Route path="parts/consolidado" element={page(<StockConsolidado />)} />
            <Route path="qr" element={page(<QRGenerator />)} />
            <Route path="checklists" element={page(<ChecklistTemplates />)} />
            <Route path="checklists/:templateId/execute" element={page(<ChecklistExecute />)} />
            <Route path="reports" element={page(<Reports />)} />
            <Route path="maintenance" element={page(<Maintenance />)} />
            <Route path="settings" element={page(<Settings />)} />
          </Route>
        </Routes>
      </LabProvider>
    </ToastProvider>
  )
}
