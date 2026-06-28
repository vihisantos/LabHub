import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from './lib/ThemeContext'

const Launcher = lazy(() => import('./pages/Launcher').then(m => ({ default: m.Launcher })))
const PCareApp = lazy(() => import('./apps/pcare').then(m => ({ default: m.PCareApp })))
const StockApp = lazy(() => import('./apps/stock').then(m => ({ default: m.StockApp })))

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
    <ThemeProvider>
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route index element={<Launcher />} />
            <Route path="pcare/*" element={<PCareApp />} />
            <Route path="stock/*" element={<StockApp />} />
            <Route path="general-stock/*" element={<StockApp />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ThemeProvider>
  )
}
