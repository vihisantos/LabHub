import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { GlobalPresenceIndicator } from './apps/pcare/components/GlobalPresenceIndicator'
import { CommandPalette } from './platform/CommandPalette/CommandPalette'
import { WorkspaceProvider } from './core/workspaces/WorkspaceContext'
import { LoginPage } from './platform/Login/LoginPage'

const DashboardPage = lazy(() => import('./platform/Dashboard/DashboardPage').then(m => ({ default: m.DashboardPage })))
const Launcher = lazy(() => import('./platform/Launcher/Launcher').then(m => ({ default: m.Launcher })))
const Roadmap = lazy(() => import('./pages/Roadmap').then(m => ({ default: m.Roadmap })))
const PCCareApp = lazy(() => import('./apps/pcare').then(m => ({ default: m.PCCareApp })))
const StockApp = lazy(() => import('./apps/stock').then(m => ({ default: m.StockApp })))
const ReservaLabApp = lazy(() => import('./apps/reservalab').then(m => ({ default: m.ReservaLabApp })))
const TvApp = lazy(() => import('./apps/tv').then(m => ({ default: m.TvApp })))
const ChamadosApp = lazy(() => import('./apps/chamados').then(m => ({ default: m.ChamadosApp })))
const ChamadosPublicApp = lazy(() => import('./apps/chamados-publico').then(m => ({ default: m.ChamadosPublicApp })))
const NotificationsPage = lazy(() => import('./platform/Admin/NotificationsPage').then(m => ({ default: m.NotificationsPage })))
const LogsPage = lazy(() => import('./platform/Admin/LogsPage').then(m => ({ default: m.LogsPage })))

function RouteFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        <p className="text-xs text-fg-muted">Carregando...</p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <WorkspaceProvider>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="login" element={<LoginPage />} />
            <Route index element={<DashboardPage />} />
            <Route path="launcher" element={<Launcher />} />
            <Route path="roadmap" element={<Roadmap />} />
            <Route path="pc-care/*" element={<PCCareApp />} />
            <Route path="stock/*" element={<StockApp />} />
            <Route path="general-stock/*" element={<StockApp />} />
            <Route path="reservalab/*" element={<ReservaLabApp />} />
            <Route path="tv/*" element={<TvApp />} />
            <Route path="chamados/*" element={<ChamadosApp />} />
            <Route path="chamados-publico/*" element={<ChamadosPublicApp />} />
            <Route path="admin/notifications" element={<NotificationsPage />} />
            <Route path="admin/logs" element={<LogsPage />} />
          </Routes>
        </Suspense>
        {/* ── Global command palette (Ctrl+K) ── */}
        <CommandPalette />
        {/* ── Global presence indicator (floating badge) ── */}
        <GlobalPresenceIndicator />
      </WorkspaceProvider>
    </BrowserRouter>
  )
}
