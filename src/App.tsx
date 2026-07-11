import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { GlobalPresenceIndicator } from './apps/pcare/components/GlobalPresenceIndicator'

const Launcher = lazy(() => import('./pages/Launcher').then(m => ({ default: m.Launcher })))
const Roadmap = lazy(() => import('./pages/Roadmap').then(m => ({ default: m.Roadmap })))
const PCareApp = lazy(() => import('./apps/pcare').then(m => ({ default: m.PCareApp })))
const StockApp = lazy(() => import('./apps/stock').then(m => ({ default: m.StockApp })))
const ReservaLabApp = lazy(() => import('./apps/reservalab').then(m => ({ default: m.ReservaLabApp })))
const TvApp = lazy(() => import('./apps/tv').then(m => ({ default: m.TvApp })))

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
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route index element={<Launcher />} />
          <Route path="roadmap" element={<Roadmap />} />
          <Route path="pcare/*" element={<PCareApp />} />
          <Route path="stock/*" element={<StockApp />} />
          <Route path="general-stock/*" element={<StockApp />} />
          <Route path="reservalab/*" element={<ReservaLabApp />} />
          <Route path="tv/*" element={<TvApp />} />
        </Routes>
      </Suspense>
      {/* ── Global presence indicator (floating badge) ── */}
      <GlobalPresenceIndicator />
    </BrowserRouter>
  )
}
