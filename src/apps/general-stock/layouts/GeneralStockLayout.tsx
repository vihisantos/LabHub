import { Link, Outlet, useLocation } from 'react-router-dom'
import { useRef } from 'react'

export function GeneralStockLayout() {
  const location = useLocation()
  const mainRef = useRef<HTMLDivElement>(null)

  function scrollToTop() {
    if (mainRef.current && mainRef.current.scrollTop > 0) {
      mainRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <div className="flex h-screen flex-col bg-neutral-950">
      <header className="border-b border-slate-800 bg-slate-900/80 px-3 py-2.5 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-emerald-500 to-green-600 text-[10px] font-bold text-white shadow-sm shadow-emerald-500/20 transition-transform hover:scale-105"
            title="Início"
          >
            L
          </Link>
          <button
            type="button"
            onClick={scrollToTop}
            className="flex items-center gap-2 overflow-hidden text-left"
          >
            <div className="flex flex-col">
              <h1 className="text-sm font-semibold text-white leading-tight">Estoque Geral</h1>
              <p className="text-[10px] text-slate-500 leading-tight">Lab Hub · ⌂ Início</p>
            </div>
          </button>
        </div>
      </header>

      <main ref={mainRef} className="flex-1 overflow-y-auto pb-6">
        <div key={location.pathname} className="animate-[fade-in-up_0.3s_ease-out] p-4">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
