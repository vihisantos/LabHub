import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { GlobalPresenceIndicator } from './apps/pcare/components/GlobalPresenceIndicator'
import { CommandPalette } from './platform/CommandPalette/CommandPalette'
import { MarkNotificationsReadOnVisit } from './core/notifications/MarkNotificationsReadOnVisit'
import { WorkspaceProvider } from './core/workspaces/WorkspaceContext'
import { AuthProvider } from './core/auth/AuthContext'
import { AuthGuard } from './core/auth/AuthGuard'
import { AdminGuard } from './core/auth/AdminGuard'
import { AppGuard } from './core/auth/AppGuard'
import { LeadershipAreaGuard } from './core/permissions/LeadershipAreaGuard'
import { ThemeProvider } from './lib/ThemeContext'

const LoginPage = lazy(() => import('./platform/Login/LoginPage').then(m => ({ default: m.LoginPage })))
const DashboardPage = lazy(() => import('./platform/Dashboard/DashboardPage').then(m => ({ default: m.DashboardPage })))
const HomePage = lazy(() => import('./platform/Dashboard/HomePage').then(m => ({ default: m.HomePage })))
const Roadmap = lazy(() => import('./pages/Roadmap').then(m => ({ default: m.Roadmap })))
const MusicRequestPage = lazy(() => import('./pages/MusicRequest').then(m => ({ default: m.default })))
const PCCareApp = lazy(() => import('./apps/pcare').then(m => ({ default: m.PCCareApp })))
const StockApp = lazy(() => import('./apps/stock').then(m => ({ default: m.StockApp })))
const ReservaLabApp = lazy(() => import('./apps/reservalab').then(m => ({ default: m.ReservaLabApp })))
const TvApp = lazy(() => import('./apps/tv').then(m => ({ default: m.TvApp })))
const ChamadosApp = lazy(() => import('./apps/chamados').then(m => ({ default: m.ChamadosApp })))
const ChamadosPublicApp = lazy(() => import('./apps/chamados-publico').then(m => ({ default: m.ChamadosPublicApp })))
const AdminApp = lazy(() => import('./apps/admin').then(m => ({ default: m.AdminApp })))
const LiderHome = lazy(() => import('./platform/Lider/LiderHome').then(m => ({ default: m.LiderHome })))

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

const AUTH_FALLBACK = <Navigate to="/login" replace />

function AppRoutes() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route index element={
        <AuthGuard fallback={AUTH_FALLBACK}>
          <HomePage />
        </AuthGuard>
      } />
      <Route path="dashboard" element={
        <AuthGuard fallback={AUTH_FALLBACK}>
          <AppGuard appId="dashboard">
            <DashboardPage />
          </AppGuard>
        </AuthGuard>
      } />
      <Route path="launcher" element={
        <AuthGuard fallback={AUTH_FALLBACK}>
          <HomePage />
        </AuthGuard>
      } />
      <Route path="roadmap" element={
        <AuthGuard fallback={AUTH_FALLBACK}>
          <Roadmap />
        </AuthGuard>
      } />
      <Route path="pedir-musica" element={
        <AuthGuard fallback={AUTH_FALLBACK}>
          <MusicRequestPage />
        </AuthGuard>
      } />
      <Route path="pc-care/*" element={
        <AuthGuard fallback={AUTH_FALLBACK}>
          <AppGuard appId="pc-care">
            <PCCareApp />
          </AppGuard>
        </AuthGuard>
      } />
      <Route path="stock/*" element={
        <AuthGuard fallback={AUTH_FALLBACK}>
          <AppGuard appId="stock">
            <StockApp />
          </AppGuard>
        </AuthGuard>
      } />
      <Route path="general-stock/*" element={
        <AuthGuard fallback={AUTH_FALLBACK}>
          <AppGuard appId="stock">
            <StockApp />
          </AppGuard>
        </AuthGuard>
      } />
      <Route path="reservalab/*" element={
        <AuthGuard fallback={AUTH_FALLBACK}>
          <AppGuard appId="reservalab">
            <ReservaLabApp />
          </AppGuard>
        </AuthGuard>
      } />
      <Route path="tv/*" element={
        <AuthGuard fallback={AUTH_FALLBACK}>
          <AppGuard appId="tv">
            <TvApp />
          </AppGuard>
        </AuthGuard>
      } />
      <Route path="chamados/*" element={
        <AuthGuard fallback={AUTH_FALLBACK}>
          <AppGuard appId="chamados">
            <ChamadosApp />
          </AppGuard>
        </AuthGuard>
      } />
      <Route path="chamados-publico/*" element={<ChamadosPublicApp />} />
      <Route path="lider" element={
        <AuthGuard fallback={AUTH_FALLBACK}>
          <LeadershipAreaGuard scope="team">
            <LiderHome />
          </LeadershipAreaGuard>
        </AuthGuard>
      } />
      <Route path="admin/*" element={
        <AuthGuard fallback={AUTH_FALLBACK}>
          <AdminGuard>
            <AppGuard appId="admin">
              <AdminApp />
            </AppGuard>
          </AdminGuard>
        </AuthGuard>
      } />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <WorkspaceProvider>
            <Suspense fallback={<RouteFallback />}>
              <AppRoutes />
            </Suspense>
            <CommandPalette />
            <GlobalPresenceIndicator />
            <MarkNotificationsReadOnVisit />
          </WorkspaceProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
