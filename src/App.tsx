import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { GlobalPresenceIndicator } from './apps/pcare/components/GlobalPresenceIndicator'
import { CommandPalette } from './platform/CommandPalette/CommandPalette'
import { WorkspaceProvider } from './core/workspaces/WorkspaceContext'
import { AuthProvider, useAuth } from './core/auth/AuthContext'

const LoginPage = lazy(() => import('./platform/Login/LoginPage').then(m => ({ default: m.LoginPage })))
const DashboardPage = lazy(() => import('./platform/Dashboard/DashboardPage').then(m => ({ default: m.DashboardPage })))
const Launcher = lazy(() => import('./platform/Launcher/Launcher').then(m => ({ default: m.Launcher })))
const Roadmap = lazy(() => import('./pages/Roadmap').then(m => ({ default: m.Roadmap })))
const PCCareApp = lazy(() => import('./apps/pcare').then(m => ({ default: m.PCCareApp })))
const StockApp = lazy(() => import('./apps/stock').then(m => ({ default: m.StockApp })))
const ReservaLabApp = lazy(() => import('./apps/reservalab').then(m => ({ default: m.ReservaLabApp })))
const TvApp = lazy(() => import('./apps/tv').then(m => ({ default: m.TvApp })))
const ChamadosApp = lazy(() => import('./apps/chamados').then(m => ({ default: m.ChamadosApp })))
const ChamadosPublicApp = lazy(() => import('./apps/chamados-publico').then(m => ({ default: m.ChamadosPublicApp })))
const AdminApp = lazy(() => import('./apps/admin').then(m => ({ default: m.AdminApp })))
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

function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <p className="text-xs text-fg-muted">Verificando acesso...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route index element={
        <AuthGuard>
          <DashboardPage />
        </AuthGuard>
      } />
      <Route path="launcher" element={
        <AuthGuard>
          <Launcher />
        </AuthGuard>
      } />
      <Route path="roadmap" element={
        <AuthGuard>
          <Roadmap />
        </AuthGuard>
      } />
      <Route path="pc-care/*" element={
        <AuthGuard>
          <PCCareApp />
        </AuthGuard>
      } />
      <Route path="stock/*" element={
        <AuthGuard>
          <StockApp />
        </AuthGuard>
      } />
      <Route path="general-stock/*" element={
        <AuthGuard>
          <StockApp />
        </AuthGuard>
      } />
      <Route path="reservalab/*" element={
        <AuthGuard>
          <ReservaLabApp />
        </AuthGuard>
      } />
      <Route path="tv/*" element={
        <AuthGuard>
          <TvApp />
        </AuthGuard>
      } />
      <Route path="chamados/*" element={
        <AuthGuard>
          <ChamadosApp />
        </AuthGuard>
      } />
      <Route path="chamados-publico/*" element={<ChamadosPublicApp />} />
      <Route path="admin/*" element={
        <AuthGuard>
          <AdminApp />
        </AuthGuard>
      } />
      <Route path="admin/notifications" element={
        <AuthGuard>
          <NotificationsPage />
        </AuthGuard>
      } />
      <Route path="admin/logs" element={
        <AuthGuard>
          <LogsPage />
        </AuthGuard>
      } />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <WorkspaceProvider>
          <Suspense fallback={<RouteFallback />}>
            <AppRoutes />
          </Suspense>
          <CommandPalette />
          <GlobalPresenceIndicator />
        </WorkspaceProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
